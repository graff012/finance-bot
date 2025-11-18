import { Context } from "grammy";
import { ConversationFlavor } from "@grammyjs/conversations";

export type MySession = {
  counter?: number;
  awaitingLimit?: boolean;
}

export type MyContext = Context & {
  session: MySession;
  conversation: any; // Use 'any' to avoid the complex ConversationFlavor type
};

