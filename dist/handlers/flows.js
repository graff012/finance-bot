"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addIncomeConversation = addIncomeConversation;
exports.addExpenseConversation = addExpenseConversation;
const db_1 = __importDefault(require("../db"));
const utils_1 = require("../utils");
const utils_2 = require("../utils");
async function addIncomeConversation(conversation, ctx) {
    await ctx.reply("Daromad manbayini kiriting (masalan ish haqi):");
    const sourceMsg = await conversation.wait(); // pause until next message from user
    console.log("addIncomeConversation: got sourceMsg", Object.keys(sourceMsg), sourceMsg.message?.text);
    const source = sourceMsg.message?.text?.trim() ?? "Daromad";
    await ctx.reply("Summasini kiriting (raqam, masalan, 500000)");
    const amountMsg = await conversation.wait();
    const amountText = (amountMsg.message?.text ?? "").replace(",", ".").trim();
    const amount = parseFloat(amountText);
    if (Number.isNaN(amount) || amount <= 0) {
        await ctx.reply("Iltimos haqiqiy raqam kiriting. Jarayon bekor qilindi");
        return;
    }
    // ensure user exists
    let user = await db_1.default.user.findUnique({
        where: { telegramId: ctx.from.id },
    });
    if (!user) {
        user = await db_1.default.user.create({
            data: {
                telegramId: ctx.from.id,
                firstName: ctx.from.first_name,
                userName: ctx.from.username ?? null,
            },
        });
    }
    // save transaction
    await db_1.default.transaction.create({
        data: {
            userId: user.id,
            type: "INCOME",
            title: source,
            amount,
            category: "income",
        },
    });
    await ctx.reply(`Daromad saqlandi: ${source} - ${(0, utils_1.fmtAmount)(amount)}`);
}
/**
 * Conversation for adding expense:
 * 1) ask title
 * 2) ask amount
 * 3) ask category
 * 4) save to DB
 * 5) check monthly limit and notify if exceeded
 */
async function addExpenseConversation(conversation, ctx) {
    // Title
    await ctx.reply("Xarajat nomini kiriting (masalan: go'sht, transport):");
    const titleMsg = await conversation.wait();
    const title = titleMsg.message?.text?.trim() ?? "xarajat";
    // Amount
    await ctx.reply("Summasini kiriting (raqam, masalan: 20000):");
    const amountMsg = await conversation.wait();
    const amountText = (amountMsg.message?.text ?? "").replace(",", ".").trim();
    const amount = parseFloat(amountText);
    if (Number.isNaN(amount) || amount <= 0) {
        await ctx.reply("Iltimos haqiqiy raqam kiriting. Jarayon bekor qilindi.");
        return;
    }
    // Category
    await ctx.reply("Kategoriya kiriting (masalan: oziq-ovqat, transport):");
    const catMsg = await conversation.wait();
    const category = catMsg.message?.text?.trim() ?? "other";
    // Ensure user exists
    let user = await db_1.default.user.findUnique({
        where: { telegramId: ctx.from.id },
    });
    if (!user) {
        user = await db_1.default.user.create({
            data: {
                telegramId: ctx.from.id,
                firstName: ctx.from.first_name,
                userName: ctx.from.username ?? null,
            },
        });
    }
    // Save transaction
    await db_1.default.transaction.create({
        data: {
            userId: user.id,
            type: "EXPENSE",
            title,
            amount,
            category,
        },
    });
    await ctx.reply(`Xarajat saqlandi: ${title} — ${(0, utils_1.fmtAmount)(amount)} so'm, kategoriya: ${category}`);
    // CHECK LIMIT: if user has a monthly limit, compute month total and notify if exceeded
    const limit = await db_1.default.limit.findUnique({ where: { userId: user.id } });
    const { start, end } = (0, utils_2.getMonthRangeForDate)(new Date());
    // compute totals for the month
    const [aggExpense, aggIncome] = await Promise.all([
        db_1.default.transaction.aggregate({
            where: {
                userId: user.id,
                type: "EXPENSE",
                date: { gte: start, lte: end },
            },
            _sum: { amount: true },
        }),
        db_1.default.transaction.aggregate({
            where: {
                userId: user.id,
                type: "INCOME",
                date: { gte: start, lte: end },
            },
            _sum: { amount: true },
        }),
    ]);
    const totalExpense = aggExpense._sum.amount ?? 0;
    const totalIncome = aggIncome._sum.amount ?? 0;
    // notify about monthly limit if configured
    if (limit) {
        if (totalExpense > limit.amount) {
            await ctx.reply(`⚠️ Diqqat! Sizning oy limitingiz (${(0, utils_1.fmtAmount)(limit.amount)}) oshdi. Jami xarajat: ${(0, utils_1.fmtAmount)(totalExpense)}.`);
        }
    }
    // NEW: notify if expenses exceed income for this month
    if (totalExpense > totalIncome) {
        const diff = totalExpense - totalIncome;
        await ctx.reply(`⚠️ Eslatma: shu oy jami xarajatlaringiz (${(0, utils_1.fmtAmount)(totalExpense)}) jami daromadingizdan (${(0, utils_1.fmtAmount)(totalIncome)}) ${(0, utils_1.fmtAmount)(diff)} so'm ko'p. Iltimos byudjetni tekshiring.`);
    }
    else {
        // optional positive confirmation — not required but helpful
        const diff = totalIncome - totalExpense;
        await ctx.reply(`✅ Hozirgi oylik balans ijobiy: ${(0, utils_1.fmtAmount)(diff)} so'm qolgan.`);
    }
}
//# sourceMappingURL=flows.js.map