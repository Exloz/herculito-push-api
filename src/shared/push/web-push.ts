import webpush from 'web-push';

export interface WebPushConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface PushSubscriptionLike {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export const initWebPush = (config: WebPushConfig): void => {
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
};

export const sendPush = async (subscription: PushSubscriptionLike, payload: PushPayload): Promise<void> => {
  const jsonPayload = JSON.stringify(payload);
  await webpush.sendNotification(subscription as unknown as webpush.PushSubscription, jsonPayload, {
    TTL: 60 * 60
  });
};
