import "dotenv/config";
import { Bot, InlineKeyboard, session, webhookCallback } from "grammy"; // <- session imported synchronously
import {
  Conversation,
  conversations,
  createConversation,
} from "@grammyjs/conversations";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import prisma from "./db";
import { MyContext, MySession } from "./types";
import {
  addExpenseConversation,
  addIncomeConversation,
} from "./handlers/flows";
import express from "express";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing");

const bot = new Bot<MyContext>(token);

// --- session middleware (in-memory, for dev)
bot.use(session({ initial: (): MySession => ({}) } as any)); // no top-level await needed

// register conversations plugin
bot.use(conversations() as any);

// register conversation functions
bot.use(createConversation(addIncomeConversation) as any);
bot.use(createConversation(addExpenseConversation) as any);

// debugging middleware — prints every incoming update (safe to remove later)
// bot.use(async (ctx, next) => {
//   try {
//     console.log("--- incoming update ---");
//     console.log("updateType:", ctx.updateType);
//     // Print a compact message text if present, else the whole update (small)
//     if (ctx.message?.text) {
//       console.log("message.text:", ctx.message.text);
//     } else {
//       console.log(JSON.stringify(ctx.update, null, 2));
//     }
//   } catch (e) {
//     console.warn("debug log failed", e);
//   }
//   await next();
// });

// Main menu keyboard
const mainMenu = new InlineKeyboard()
  .text("➕ Kirim qo'shish", "add_income")
  .row()
  .text("➖ Chiqim qo'shish", "add_expense")
  .row()
  .text("📊 Kunlik xarajat", "report_today")
  .row()
  .text("📅 Oylik xarajat", "report_month");

// starting command
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Hisob-Kitob telegram botiga xush kelibsiz\nPastdagi buyruqlardan birini tanlang",
    { reply_markup: mainMenu },
  );
});

bot.command("help", async (ctx) => {
  const helpText = `📚 *Yordam — Finance Bot* 

Ushbu bot bilan siz oylik va kundalik daromad va xarajatlarni yozib borishingiz mumkin.

Asosiy buyruqlar:
/start — Asosiy menyuni ko'rsatadi
/help — Ushbu yordam xabari
/add_income — Yangi daromad qo'shish (bot sizdan manba va summani so'raydi)
/add_expense — Yangi xarajat qo'shish (bot sizdan nom, summa va kategoriya so'raydi)
/report_today — Bugungi hisobot (daromad / xarajat)
/report_month — Oylik hisobot (daromad / xarajat)
/balance — Balansni ko'rish

🔔 Eslatma:
• Bot yangi xarajat qo'shilganda avtomatik tekshiradi — agar shu oy xarajatlaringiz daromaddan oshsa, ogohlantiradi.`;

  await ctx.reply(helpText);
});

// Command handlers for text commands
bot.command("add_income", async (ctx) => {
  await (ctx as any).conversation.enter(addIncomeConversation.name);
});

bot.command("add_expense", async (ctx) => {
  await (ctx as any).conversation.enter(addExpenseConversation.name);
});

bot.command("report_today", async (ctx) => {
  const { start, end } = getDayRange(new Date());

  const income = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "INCOME",
      date: { gte: start, lte: end },
      userId: ctx.from?.id
        ? { equals: (await getUser(ctx.from.id)).id }
        : undefined,
    },
  });

  const expense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "EXPENSE",
      date: { gte: start, lte: end },
      userId: ctx.from?.id
        ? { equals: (await getUser(ctx.from.id)).id }
        : undefined,
    },
  });

  const tz = process.env.TZ || "Asia/Tashkent";
  await ctx.reply(
    `📊 Bugungi hisobot (${formatInTimeZone(new Date(), tz, "yyyy-MM-dd")}):\n\n` +
      `Kirim: ${income._sum.amount ?? 0}\n` +
      `Chiqim: ${expense._sum.amount ?? 0}`,
  );
});

bot.command("report_month", async (ctx) => {
  const { start, end } = getMonthRange(new Date());

  const income = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "INCOME",
      date: { gte: start, lte: end },
      userId: ctx.from?.id
        ? { equals: (await getUser(ctx.from.id)).id }
        : undefined,
    },
  });

  const expense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "EXPENSE",
      date: { gte: start, lte: end },
      userId: ctx.from?.id
        ? { equals: (await getUser(ctx.from.id)).id }
        : undefined,
    },
  });

  const tz = process.env.TZ || "Asia/Tashkent";
  await ctx.reply(
    `📅 Oylik hisobot (${formatInTimeZone(new Date(), tz, "yyyy-MM")}):\n\n` +
      `Kirim: ${income._sum.amount ?? 0}\n` +
      `Chiqim: ${expense._sum.amount ?? 0}`,
  );
});

bot.command("balance", async (ctx) => {
  const user = await getUser(ctx.from!.id);

  const income = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "INCOME",
      userId: user.id,
    },
  });

  const expense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "EXPENSE",
      userId: user.id,
    },
  });

  const totalIncome = income._sum.amount ?? 0;
  const totalExpense = expense._sum.amount ?? 0;
  const balance = totalIncome - totalExpense;

  await ctx.reply(
    `💰 Sizning balansingiz:\n\n` +
      `Jami kirim: ${fmtAmount(totalIncome)}\n` +
      `Jami chiqim: ${fmtAmount(totalExpense)}\n` +
      `Balans: ${fmtAmount(balance)}`,
  );
});

// Helper function to get or create user
async function getUser(telegramId: number) {
  let user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId,
        firstName: "User", // This will be updated when they use conversations
        userName: null,
      },
    });
  }

  return user;
}

// Import fmtAmount at the top of the file
import { fmtAmount } from "./utils";

// Button Logics
bot.callbackQuery("add_income", async (ctx) => {
  await ctx.answerCallbackQuery();
  await (ctx as any).conversation.enter(addIncomeConversation.name);
});

bot.callbackQuery("add_expense", async (ctx) => {
  await ctx.answerCallbackQuery();
  await (ctx as any).conversation.enter(addExpenseConversation.name);
});

// Better: use date ranges for day/month queries (rather than comparing strings)
function getDayRange(date: Date) {
  const tz = process.env.TZ || "Asia/Tashkent";
  const zoned = toZonedTime(date, tz);
  const dayStart = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    0,
    0,
    0,
  );
  const dayEnd = new Date(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    23,
    59,
    59,
    999,
  );
  return { start: dayStart, end: dayEnd };
}

function getMonthRange(date: Date) {
  const tz = process.env.TZ || "Asia/Tashkent";
  const zoned = toZonedTime(date, tz);
  const start = new Date(zoned.getFullYear(), zoned.getMonth(), 1, 0, 0, 0);
  const end = new Date(
    zoned.getFullYear(),
    zoned.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

bot.callbackQuery("report_today", async (ctx) => {
  await ctx.answerCallbackQuery();

  const { start, end } = getDayRange(new Date());
  const user = await getUser(ctx.from!.id);

  const income = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "INCOME",
      date: { gte: start, lte: end },
      userId: user.id,
    },
  });

  const expense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "EXPENSE",
      date: { gte: start, lte: end },
      userId: user.id,
    },
  });

  const tz = process.env.TZ || "Asia/Tashkent";
  await ctx.reply(
    `📊 Bugungi hisobot (${formatInTimeZone(new Date(), tz, "yyyy-MM-dd")}):\n\n` +
      `Kirim: ${income._sum.amount ?? 0}\n` +
      `Chiqim: ${expense._sum.amount ?? 0}`,
  );
});

bot.callbackQuery("report_month", async (ctx) => {
  await ctx.answerCallbackQuery();

  const { start, end } = getMonthRange(new Date());
  const user = await getUser(ctx.from!.id);

  const income = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "INCOME",
      date: { gte: start, lte: end },
      userId: user.id,
    },
  });

  const expense = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: {
      type: "EXPENSE",
      date: { gte: start, lte: end },
      userId: user.id,
    },
  });

  const tz = process.env.TZ || "Asia/Tashkent";
  await ctx.reply(
    `📅 Oylik hisobot (${formatInTimeZone(new Date(), tz, "yyyy-MM")}):\n\n` +
      `Kirim: ${income._sum.amount ?? 0}\n` +
      `Chiqim: ${expense._sum.amount ?? 0}`,
  );
});

bot.catch((err) => {
  console.error("Bot Error:", err);
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "finance-bot-secret";

// validate
if (!WEBHOOK_URL) {
  throw new Error(
    "WEBHOOK_URL is missing in env (e.g. https://your-app.onrender.com)",
  );
}

async function main() {
  await bot.init();

  const webhookPath = `/webhook/${WEBHOOK_SECRET}`;

  // Express app
  const app = express();
  app.use(express.json());

  app.post("/webhook-debug", async (req, res) => {
    console.log("webhook-debug body:", JSON.stringify(req.body).slice(0, 1000));
    res.sendStatus(200);
  });

  // Telegram will POST updates here

  // With this robust wrapper:
  app.post(webhookPath, async (req, res) => {
    try {
      // Very small debug log for incoming update (optional)
      // console.log('Incoming update type:', req.body?.update_id ? 'update' : typeof req.body);
      // Let grammY process the update safely
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      // Log everything we can for debugging
      console.error(
        "Webhook handler error:",
        err && err.stack ? err.stack : err,
      );
      // Also log small context of incoming update to spot bad payloads (trim large bodies)
      try {
        const payloadPreview = JSON.stringify(req.body).slice(0, 2000);
        console.error("Webhook payload (preview):", payloadPreview);
      } catch (e) {
        console.error("Failed to stringify payload preview:", e);
      }
      // Return 200 so Telegram doesn't retry aggressively; we'll fix root cause next
      res.sendStatus(200);
    }
  });

  // a simple healthcheck
  app.get("/", (_req, res) => res.send("OK"));

  // start express server and set webhook on Telegram
  // safe webhook setter: check current webhook first and respect retry-after
  async function ensureWebhookSet(
    bot: Bot,
    baseUrl: string,
    webhookPath: string,
  ) {
    const fullUrl = `${baseUrl.replace(/\/$/, "")}${webhookPath}`;
    try {
      const info = await bot.api.getWebhookInfo();
      const current = info.url || "";

      if (current === fullUrl) {
        console.log("Webhook already set and matches:", fullUrl);
        return;
      }

      console.log("Current webhook differs. Setting webhook to:", fullUrl);
      await bot.api.setWebhook(fullUrl);
      console.log("Webhook set successfully.");
      return;
    } catch (err: any) {
      // If Telegram tells us to wait, respect it
      const params = err?.parameters;
      const retryAfter = params?.retry_after;
      if (retryAfter) {
        const waitMs = Number(retryAfter) * 1000;
        console.warn(
          `setWebhook rate-limited. retry_after=${retryAfter}s — waiting ${waitMs}ms and retrying once.`,
        );
        await new Promise((res) => setTimeout(res, waitMs));
        // try one more time
        try {
          await bot.api.setWebhook(fullUrl);
          console.log("Webhook set successfully after waiting.");
          return;
        } catch (err2) {
          console.error("Failed to set webhook after waiting:", err2);
          return;
        }
      }

      // Other errors
      console.error("Failed to check/set webhook:", err);
      return;
    }
  }

  const server = app.listen(PORT, async () => {
    const base = (WEBHOOK_URL || "").replace(/\/$/, "");
    const fullWebhookUrl = `${base}${webhookPath}`;
    console.log(
      `Server listening on port ${PORT}, will ensure webhook ${fullWebhookUrl}`,
    );

    // Ensure we don't spam setWebhook across rapid deploys
    try {
      await ensureWebhookSet(bot, base, webhookPath);
    } catch (e) {
      console.error("ensureWebhookSet error:", e);
    }
  });

  // graceful shutdown
  async function gracefulShutdown() {
    console.log("Shutting down gracefully...");
    try {
      // remove webhook so Telegram stops sending to this instance
      await bot.api.deleteWebhook();
    } catch (e) {
      console.warn("deleteWebhook failed:", (e as any)?.message ?? e);
    }
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  }

  process.once("SIGINT", gracefulShutdown);
  process.once("SIGTERM", gracefulShutdown);
}

main().catch((err) => {
  console.error('fatal error starting bot:', err)
  process.exit(1)
})
