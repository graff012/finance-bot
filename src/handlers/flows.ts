import prisma from "../db";
import { MyContext } from "../types";
import { fmtAmount } from "../utils";

export async function addIncomeConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  await ctx.reply("Daromad manbayini kiriting (masalan ish haqi):");
  const sourceMsg = await conversation.wait(); // pause until next message from user
  console.log(
    "addIncomeConversation: got sourceMsg",
    sourceMsg.updateType,
    sourceMsg.message?.text,
  );
  const source = sourceMsg.message?.text?.trim() ?? "Daromad";

  await ctx.reply("Summasini kiriting (raqam, masalan, 500000)");
  const amountMsg = await conversation.wait();
  console.log(
    "addIncomeConversation: got amountMsg",
    amountMsg.updateType,
    amountMsg.message?.text,
  );
  const amountText = (amountMsg.message?.text ?? "").replace(",", ".").trim();
  const amount = parseFloat(amountText);
  if (Number.isNaN(amount) || amount <= 0) {
    await ctx.reply("Iltimos haqiqiy raqam kiriting. Jarayon bekor qilindi");
    return;
  }

  // ensure user exists
  let user = await prisma.user.findUnique({
    where: { telegramId: ctx.from!.id },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: ctx.from!.id,
        firstName: ctx.from!.first_name,
        userName: ctx.from!.username,
      },
    });
  }

  // save transaction
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "INCOME",
      title: source,
      amount,
      category: "income",
    },
  });

  await ctx.reply(`Daromad saqlandi: ${source} - ${fmtAmount(amount)}`);
}

/**
 * Conversation for adding expense:
 * 1) ask title
 * 2) ask amount
 * 3) ask category
 * 4) save to DB
 * 5) check monthly limit and notify if exceeded
 */

export async function addExpenseConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  // Title
  await ctx.reply("Xarajat nomini kiriting (masalan: non, transport):");
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
  let user = await prisma.user.findUnique({
    where: { telegramId: ctx.from!.id },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: ctx.from!.id,
        firstName: ctx.from!.first_name,
        username: ctx.from!.username ?? undefined,
      },
    });
  }

  // Save transaction
  await prisma.transaction.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      title,
      amount,
      category,
    },
  });

  await ctx.reply(
    `Xarajat saqlandi: ${title} — ${fmtAmount(amount)} so'm, kategoriya: ${category}`,
  );

  // CHECK LIMIT: if user has a monthly limit, compute month total and notify if exceeded
  const limit = await prisma.limit.findUnique({ where: { userId: user.id } });
  const { start, end } = getMonthRangeForDate(new Date());

  // compute totals for the month
  const [aggExpense, aggIncome] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        userId: user.id,
        type: "EXPENSE",
        date: { gte: start, lte: end },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
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
      await ctx.reply(
        `⚠️ Diqqat! Sizning oy limitingiz (${fmtAmount(limit.amount)}) oshdi. Jami xarajat: ${fmtAmount(totalExpense)}.`,
      );
    }
  }

  // NEW: notify if expenses exceed income for this month
  if (totalExpense > totalIncome) {
    const diff = totalExpense - totalIncome;
    await ctx.reply(
      `⚠️ Eslatma: shu oy jami xarajatlaringiz (${fmtAmount(totalExpense)}) jami daromadingizdan (${fmtAmount(totalIncome)}) ${fmtAmount(diff)} so'm ko'p. Iltimos byudjetni tekshiring.`,
    );
  } else {
    // optional positive confirmation — not required but helpful
    const diff = totalIncome - totalExpense;
    await ctx.reply(
      `✅ Hozirgi oylik balans ijobiy: ${fmtAmount(diff)} so'm qolgan.`,
    );
  }
}
