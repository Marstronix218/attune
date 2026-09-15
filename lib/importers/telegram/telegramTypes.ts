export type TelegramTextEntity = { type: string; text: string };

export type TelegramMessage = {
  id: number;
  type?: string;
  date: string;
  date_unixtime?: string;
  from?: string;
  from_id?: string;
  text?: string | TelegramTextEntity[];
  reply_to_message_id?: number;
  media_type?: string;
};

export type TelegramExport = {
  name?: string;
  type?: string;
  id?: number;
  messages: TelegramMessage[];
};

export type NormalizedMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  timestampUtc: string;
  replyToMessageId: string | null;
  mediaType: string | null;
  metadata: Record<string, unknown>;
};
