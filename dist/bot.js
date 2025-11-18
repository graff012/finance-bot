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

🔔 Eslatma:
• Bot yangi xarajat qo'shilganda avtomatik tekshiradi — agar shu oy xarajatlaringiz daromaddan oshsa, ogohlantiradi.

Agar sizga yordam kerak bo'lsa yoki xatolik ko'rsangiz, menga xabar yuboring.`;
    // send as Markdown to get bold/italics (avoid user-supplied content here)
    await ctx.reply(helpText);
});
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
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: { type: "INCOME", date: { gte: start, lte: end } },
    });
    const expense = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: { type: "EXPENSE", date: { gte: start, lte: end } },
    });
    const tz = process.env.TZ || "Asia/Tashkent";
    await ctx.reply(`📊 Bugungi hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM-dd")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.callbackQuery("report_month", async (ctx) => {
    await ctx.answerCallbackQuery();
    const { start, end } = getMonthRange(new Date());
    const income = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: { type: "INCOME", date: { gte: start, lte: end } },
    });
    const expense = await db_1.default.transaction.aggregate({
        _sum: { amount: true },
        where: { type: "EXPENSE", date: { gte: start, lte: end } },
    });
    const tz = process.env.TZ || "Asia/Tashkent";
    await ctx.reply(`📅 Oylik hisobot (${(0, date_fns_tz_1.formatInTimeZone)(new Date(), tz, "yyyy-MM")}):\n\n` +
        `Kirim: ${income._sum.amount ?? 0}\n` +
        `Chiqim: ${expense._sum.amount ?? 0}`);
});
bot.catch((err) => {
    console.error("Bot Error:", err);
});
bot.start();
console.log("Bot is running");
//# sourceMappingURL=bot.js.map