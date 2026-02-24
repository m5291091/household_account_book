export interface PaymentMethod {
  id: string;
  name: string;
  linkedAccountId?: string; // ID of the linked BankAccount or CreditCard
}