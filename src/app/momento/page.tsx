"use client";
import Image from "next/image";

import React, { useEffect, useState, useRef, cache } from "react";
import { v4 as uuidv4 } from "uuid";
import { Tag } from "@chakra-ui/tag";
import { Input, InputGroup, InputRightElement } from "@chakra-ui/input";
import { FormControl } from "@chakra-ui/form-control";
import { Button } from "@chakra-ui/button";

import {
  Configurations,
  CredentialProvider,
  MomentoErrorCode,
  TopicClient,
  type TopicItem,
  TopicPublish,
  TopicSubscribe,
} from "@gomomento/sdk-web";

enum EventTypes {
  MESSAGE = "message",
  USER_JOINED = "user_joined",
}

type ChatMessageEvent = {
  event: EventTypes.MESSAGE;
  username: string;
  text: string;
  // timestamp: number;
};

type UserJoinedEvent = {
  event: EventTypes.USER_JOINED;
  username: string;
  // timestamp: number;
};

type ChatEvent = UserJoinedEvent | ChatMessageEvent;

let webTopicClient: TopicClient | undefined = undefined;
let subscription: TopicSubscribe.Subscription | undefined = undefined;
let onItemCb: (item: TopicItem) => void;
let onErrorCb: (
  error: TopicSubscribe.Error,
  subscription: TopicSubscribe.Subscription
) => Promise<void>;

type MomentoClients = {
  topicClient: TopicClient;
};

async function getNewWebClients(): Promise<MomentoClients> {
  webTopicClient = undefined;
  // we don't want to cache the token, since it will expire in 5 min
  // const fetchResp = await fetch(window.location.origin + "/api/momento/token", {
  //   cache: "no-store",
  // });
  // const token = await fetchResp.text();
  const topicClient = new TopicClient({
    configuration: Configurations.Browser.v1(),
    credentialProvider: CredentialProvider.fromString({
      apiKey: String(process.env.NEXT_PUBLIC_MOMENTO_API_KEY),
    }),
  });
  webTopicClient = topicClient;
  return {
    topicClient,
  };
}

const clearCurrentClient = () => {
  subscription?.unsubscribe();
  subscription = undefined;
  webTopicClient = undefined;
};

async function getWebTopicClient(): Promise<TopicClient> {
  if (webTopicClient) {
    return webTopicClient;
  }

  const clients = await getNewWebClients();
  return clients.topicClient;
}

// export async function listCaches(): Promise<string[]> {
//   const fetchResp = await fetch(window.location.origin + "/api/momento/caches");
//   const caches: string[] = await fetchResp.json();
//   return caches;
// }

async function subscribeToTopic(
  cacheName: string,
  topicName: string,
  onItem: (item: TopicItem) => void,
  onError: (
    error: TopicSubscribe.Error,
    subscription: TopicSubscribe.Subscription
  ) => Promise<void>
) {
  onErrorCb = onError;
  onItemCb = onItem;
  const topicClient = await getWebTopicClient();
  const resp = await topicClient.subscribe(cacheName, topicName, {
    onItem: onItemCb,
    onError: onErrorCb,
  });
  if (resp instanceof TopicSubscribe.Subscription) {
    subscription = resp;
    return subscription;
  }

  throw new Error(`unable to subscribe to topic: ${resp}`);
}

async function publish(cacheName: string, topicName: string, message: string) {
  const topicClient = await getWebTopicClient();
  const resp = await topicClient.publish(cacheName, topicName, message);
  if (resp instanceof TopicPublish.Error) {
    if (resp.errorCode() === MomentoErrorCode.AUTHENTICATION_ERROR) {
      console.log(
        "token has expired, going to refresh subscription and retry publish"
      );
      clearCurrentClient();
      await subscribeToTopic(cacheName, topicName, onItemCb, onErrorCb);
      await publish(cacheName, topicName, message);
    } else {
      console.error("failed to publish to topic", resp);
    }
  }
}

async function userJoined(
  cacheName: string,
  topicName: string,
  username: string
) {
  const userJoinedEvent: UserJoinedEvent = {
    username,
    // timestamp: Date.now(),
    event: EventTypes.USER_JOINED,
  };
  await publish(cacheName, topicName, JSON.stringify(userJoinedEvent));
}

async function sendMessage(
  cacheName: string,
  topicName: string,
  username: string,
  text: string
) {
  const chatMessage: ChatMessageEvent = {
    username,
    text,
    // timestamp: Date.now(),
    event: EventTypes.MESSAGE,
  };
  await publish(cacheName, topicName, JSON.stringify(chatMessage));
}

type Props = {
  topicName: string;
  cacheName: string;
  username: string;
  onLeave: () => void;
};

function ChatInput(props: {
  cacheName: string;
  topicName: string;
  userName: string;
}) {
  const [input, setInput] = useState("");
  const handleInputChange = (e: any) => setInput(e.target.value);

  const handleChatInputSubmit = () => {
    sendMessage(props.cacheName, props.topicName, props.userName, input);
    setInput("");
  };

  useEffect(() => {}, [input]);

  return (
    <FormControl className="flex  flex-col items-center m-1">
      <InputGroup size="md" width={400}>
        <Input
          pr="4.5rem"
          type="text"
          placeholder="Enter Chat"
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleChatInputSubmit();
            }
          }}
        />
        <InputRightElement width="4.5rem">
          <Button
            colorScheme="teal"
            variant="solid"
            h="1.75rem"
            size="sm"
            type="submit"
            onClick={handleChatInputSubmit}
          >
            {"SEND"}
          </Button>
        </InputRightElement>
      </InputGroup>
    </FormControl>
  );
}

function ChatToolTip(props: { chat: ChatEvent }) {
  if ("text" in props.chat) {
    return (
      <Tag className="m-1" key={uuidv4()} colorScheme="blue">
        {props.chat.text}
      </Tag>
    );
  } else {
    return (
      <Tag className="m-1" key={uuidv4()} colorScheme="pink">
        {`${props.chat.username} has joinded`}
      </Tag>
    );
  }
}

export default function Home() {
  // const userName = uuidv4();
  const [userName, setUserName] = useState<string>("");
  const cacheName = String(process.env.NEXT_PUBLIC_MOMENTO_CACHE_NAME);
  const topicName = String(process.env.NEXT_PUBLIC_MOMENTO_TOPIC_NAME);

  const [chats, setChats] = useState<ChatEvent[]>([]);

  const onItem = (item: TopicItem) => {
    try {
      const message = JSON.parse(item.valueString()) as ChatEvent;
      // console.log(typeof message);
      setChats((curr) => [...curr, message]);
    } catch (e) {
      console.error("unable to parse chat message", e);
    }
  };

  const onError = async (
    error: TopicSubscribe.Error,
    sub: TopicSubscribe.Subscription
  ) => {
    console.error(
      "received error from momento, getting new token and resubscribing",
      error
    );
    sub.unsubscribe();
    clearCurrentClient();
    await subscribeToTopic(cacheName, topicName, onItem, onError);
  };

  useEffect(() => {
    const name = uuidv4();
    setUserName(name);
    subscribeToTopic(cacheName, topicName, onItem, onError)
      .then(() => {
        console.log("successfully subscribed");
        // sendMessage(cacheName, topicName, "aiueo", "message");
        userJoined(cacheName, topicName, name);
      })
      .catch((e) => {
        console.error("error subscribing to topic", e);
      });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center  p-24">
      <Tag className="m-1" key={uuidv4()} colorScheme="blue">
        {userName}
      </Tag>
      <ChatInput
        cacheName={cacheName}
        topicName={topicName}
        userName={userName}
      />
      <p className="m-1">↓Chat↓</p>
      {chats.map((chat) => (
        <ChatToolTip key={uuidv4()} chat={chat} />
      ))}
    </main>
  );
}
