"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/bot.ts
require("dotenv/config");
const grammy_1 = require("grammy"); // <- session imported synchronously
const conversations_1 = require("@grammyjs/conversations");
const date_fns_tz_1 = require("date-fns-tz");
const db_1 = __importDefault(require("./db"));
const flows_1 = require("./handlers/flows");
const express_1 = __importDefault(require("express"));
const token = process.env.BOT_TOKEN;
if (!token)
    throw new Error("BOT_TOKEN is missing");
const bot = new grammy_1.Bot(token);
// --- session middleware (in-memory, for dev)
bot.use((0, grammy_1.session)({ initial: () => ({}) })); // no top-level await needed
// register conversations plugin
bot.use((0, conversations_1.conversations)());
// register conversation functions
bot.use((0, conversations_1.createConversation)(flows_1.addIncomeConversation));
bot.use((0, conversations_1.createConversation)(flows_1.addExpenseConversation));
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
const mainMenu = new grammy_1.InlineKeyboard()
    .text("➕ Kirim qo'shish", "add_income")
    .row()
    .text("➖ Chiqim qo'shish", "add_expense")
    .row()
    .text("📊 Kunlik xarajat", "report_today")
    .row()
    .text("📅 Oylik xarajat", "report_month");
// starting command
bot.command("start", async (ctx) => {
    await ctx.reply("Hisob-Kitob telegram botiga xush kelibsiz\nPastdagi buyruqlardan birini tanlang", { reply_markup: mainMenu });
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
    await ctx.conversation.enter(flows_1.addIncomeConversation.name);
});
bot.command("add_expense", async (ctx) => {
    await ctx.conversation.enter(flows_1.addExpenseConversation.name);
});
bot.command("report_today", async (ctx) => {
    const { start, end } = getDayRange(new Date());
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "INCOME",
            date: { gte: start, lte: end },
            userId: ctx.from?.id
                ? { equals: (await getUser(ctx.from.id)).id }
                : undefined,
        },
    });
    const expense = await db_1.default.transaction.aggregate({
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
    await ctx.reply(`📊 Bugungi hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM-dd")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.command("report_month", async (ctx) => {
    const { start, end } = getMonthRange(new Date());
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "INCOME",
            date: { gte: start, lte: end },
            userId: ctx.from?.id
                ? { equals: (await getUser(ctx.from.id)).id }
                : undefined,
        },
    });
    const expense = await db_1.default.transaction.aggregate({
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
    await ctx.reply(`📅 Oylik hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.command("balance", async (ctx) => {
    const user = await getUser(ctx.from.id);
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "INCOME",
            userId: user.id,
        },
    });
    const expense = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "EXPENSE",
            userId: user.id,
        },
    });
    const totalIncome = income._sum.amount ?? 0;
    const totalExpense = expense._sum.amount ?? 0;
    const balance = totalIncome - totalExpense;
    await ctx.reply(`💰 Sizning balansingiz:\n\n` +
        `Jami kirim: ${(0, utils_1.fmtAmount)(totalIncome)}\n` +
        `Jami chiqim: ${(0, utils_1.fmtAmount)(totalExpense)}\n` +
        `Balans: ${(0, utils_1.fmtAmount)(balance)}`);
});
// Helper function to get or create user
async function getUser(telegramId) {
    let user = await db_1.default.user.findUnique({
        where: { telegramId },
    });
    if (!user) {
        user = await db_1.default.user.create({
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
const utils_1 = require("./utils");
// Button Logics
bot.callbackQuery("add_income", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter(flows_1.addIncomeConversation.name);
});
bot.callbackQuery("add_expense", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter(flows_1.addExpenseConversation.name);
});
// Better: use date ranges for day/month queries (rather than comparing strings)
function getDayRange(date) {
    const tz = process.env.TZ || "Asia/Tashkent";
    const zoned = (0, date_fns_tz_1.toZonedTime)(date, tz);
    const dayStart = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0);
    const dayEnd = new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 23, 59, 59, 999);
    return { start: dayStart, end: dayEnd };
}
function getMonthRange(date) {
    const tz = process.env.TZ || "Asia/Tashkent";
    const zoned = (0, date_fns_tz_1.toZonedTime)(date, tz);
    const start = new Date(zoned.getFullYear(), zoned.getMonth(), 1, 0, 0, 0);
    const end = new Date(zoned.getFullYear(), zoned.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}
bot.callbackQuery("report_today", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { start, end } = getDayRange(new Date());
    const user = await getUser(ctx.from.id);
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "INCOME",
            date: { gte: start, lte: end },
            userId: user.id,
        },
    });
    const expense = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "EXPENSE",
            date: { gte: start, lte: end },
            userId: user.id,
        },
    });
    const tz = process.env.TZ || "Asia/Tashkent";
    await ctx.reply(`📊 Bugungi hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM-dd")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.callbackQuery("report_month", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { start, end } = getMonthRange(new Date());
    const user = await getUser(ctx.from.id);
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "INCOME",
            date: { gte: start, lte: end },
            userId: user.id,
        },
    });
    const expense = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: {
            type: "EXPENSE",
            date: { gte: start, lte: end },
            userId: user.id,
        },
    });
    const tz = process.env.TZ || "Asia/Tashkent";
    await ctx.reply(`📅 Oylik hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.catch((err) => {
    console.error("Bot Error:", err);
});
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = Number(process.env.PORT || 3000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "finance-bot-secret";
// validate
if (!WEBHOOK_URL) {
    throw new Error("WEBHOOK_URL is missing in env (e.g. https://your-app.onrender.com)");
}
// choose a secret path — avoids accidental duplicate webhooks
const webhookPath = `/webhook/${WEBHOOK_SECRET}`;
// Express app
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Telegram will POST updates here
app.post(webhookPath, (0, grammy_1.webhookCallback)(bot, "express"));
// a simple healthcheck
app.get("/", (_req, res) => res.send("OK"));
// start express server and set webhook on Telegram
const server = app.listen(PORT, async () => {
    const fullWebhookUrl = `${WEBHOOK_URL}${webhookPath}`;
    console.log(`Server listening on port ${PORT}, setting webhook to ${fullWebhookUrl}`);
    try {
        // Set webhook to Telegram (overwrite any previous webhook)
        await bot.api.setWebhook(fullWebhookUrl);
        console.log("Webhook set successfully.");
    }
    catch (err) {
        console.error("Failed to set webhook:", err);
        // don't exit — sometimes Telegram transiently fails. You may want to crash or keep trying.
    }
});
// graceful shutdown
async function gracefulShutdown() {
    console.log("Shutting down gracefully...");
    try {
        // remove webhook so Telegram stops sending to this instance
        await bot.api.deleteWebhook();
    }
    catch (e) {
        console.warn("deleteWebhook failed:", e?.message ?? e);
    }
    server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
    });
}
process.once("SIGINT", gracefulShutdown);
process.once("SIGTERM", gracefulShutdown);
//# sourceMappingURL=bot.js.map