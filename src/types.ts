import { Context } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { Record } from "@prisma/client/runtime/library"; // adds ctx.conversations helper

export type MySession = {
  counter?: number;
  awaitingLimit?: boolean;
}

export interface MyContext extends Context, ConversationFlavor<MySession, Record<string, unknown>> {
  session: MySession
}


// /add_income — Yangi daromad qo'shish (bot sizdan manba va summani so'raydi)
// /add_expense — Yangi xarajat qo'shish (bot sizdan nom, summa va kategoriya so'raydi)
// /report_today — Bugungi hisobot (daromad / xarajat)
// /report_month — Oylik hisobot (daromad / xarajat)
// /set_limit — Oy uchun xarajat limitini belgilash
// /check_limit — Hoziroq limit holatini ko'rish
