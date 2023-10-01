"use client";
import Image from "next/image";
import {
  TopicClient,
  TopicConfigurations,
  CredentialProvider,
  type TopicItem,
  TopicSubscribe,
} from "@gomomento/sdk-web";
import React, { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const [chatHistory, setChatHistory] = useState<string[]>(["↓Chat↓"]);
  let subscription: TopicSubscribe.Subscription | undefined = undefined;

  async function subscribeToTopic(cacheName: string, topicName: string) {
    const topicClient = new TopicClient({
      configuration: TopicConfigurations.Default.latest(),
      credentialProvider: CredentialProvider.fromString({
        apiKey: process.env.NEXT_PUBLIC_MOMENTO_API_KEY!,
      }),
    });
    const resp = await topicClient.subscribe(cacheName, topicName, {
      onItem: (item: TopicItem) => {
        // console.log(item.value().toString());
        setChatHistory((chatHistory) => [
          ...chatHistory,
          item.value().toString(),
        ]);

        return;
      },
      onError: () => {
        return;
      },
    });
    if (resp instanceof TopicSubscribe.Subscription) {
      subscription = resp;
      return subscription;
    }

    throw new Error(`unable to subscribe to topic: ${resp}`);
  }

  useEffect(() => {
    subscribeToTopic("sam-momento-cache", "test")
      .then(() => {
        console.log("successfully subscribed");
        // await userJoined(props.cacheName, props.topicName, props.username);
      })
      .catch((e) => {
        console.error("error subscribing to topic", e);
      });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      {chatHistory.map((chat) => (
        <p key={uuidv4()}>{chat}</p>
      ))}
    </main>
  );
}
