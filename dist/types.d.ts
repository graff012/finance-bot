import { Context } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";
import { Record } from "@prisma/client/runtime/library";
export type MySession = {
    counter?: number;
    awaitingLimit?: boolean;
};
export interface MyContext extends Context, ConversationFlavor<MySession, Record<string, unknown>> {
    session: MySession;
}
