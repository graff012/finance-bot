import { MyContext } from "../types";
export declare function addIncomeConversation(conversation: Conversation<MyContext>, ctx: MyContext): Promise<void>;
/**
 * Conversation for adding expense:
 * 1) ask title
 * 2) ask amount
 * 3) ask category
 * 4) save to DB
 * 5) check monthly limit and notify if exceeded
 */
export declare function addExpenseConversation(conversation: Conversation<MyContext>, ctx: MyContext): Promise<void>;
