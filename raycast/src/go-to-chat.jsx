import { Action, ActionPanel, Color, Form, Icon, List, Toast, closeMainWindow, getPreferenceValues, open, showToast, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { hiveClient } from "./hive.mjs";
import { answersOf, groupChats, seatLink } from "./shape.mjs";

const TINT = { waiting: Color.Orange, working: Color.Blue, quiet: Color.SecondaryText };

function accessory(section, chat) {
  if (section === "waiting") return { tag: { value: chat.questions.length ? "question" : "waiting", color: Color.Orange } };
  if (chat.state === "starting") return { tag: { value: "starting", color: Color.Blue } };
  if (chat.state === "failed") return { tag: { value: "failed", color: Color.Red } };
  if (section === "working") return { tag: { value: "working", color: Color.Blue } };
  return { text: chat.where === "cloud" ? "cloud" : "" };
}

function detailOf(chat) {
  const parts = [`### ${chat.title}`];
  for (const question of chat.questions) {
    parts.push(`> ${question.question}`);
    if (question.options?.length) parts.push(question.options.map((one) => `- ${one.label}`).join("\n"));
  }
  if (chat.now) parts.push(`**Now** ${chat.now}`);
  if (chat.mission) parts.push(`**Mission**\n\n${chat.mission.slice(0, 500)}`);
  return parts.join("\n\n");
}

async function goTo(chat) {
  await open(seatLink(chat.name));
  await closeMainWindow({ clearRootSearch: true });
}

function Reply({ chat, client, done }) {
  const { pop } = useNavigation();
  const asking = chat.asks[0];
  const questions = asking ? (asking.questions || []) : [];

  async function submit(values) {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Sending…" });
    try {
      if (asking) {
        const answers = answersOf(questions, values);
        if (!Object.keys(answers).length) throw new Error("Pick or write an answer first");
        await client.answer(chat, asking.id, answers);
      } else {
        const text = String(values.text || "").trim();
        if (!text) throw new Error("Write something first");
        const said = await client.say(chat, text);
        if (!said.delivered) {
          toast.style = Toast.Style.Failure;
          toast.title = "This chat only takes messages inside Hive";
          toast.primaryAction = { title: "Open in Hive", onAction: () => goTo(chat) };
          return;
        }
      }
      toast.style = Toast.Style.Success;
      toast.title = `Sent to ${chat.title}`;
      done();
      pop();
    } catch (wrong) {
      toast.style = Toast.Style.Failure;
      toast.title = "It did not land";
      toast.message = wrong.message;
    }
  }

  return (
    <Form
      navigationTitle={chat.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={asking ? "Send Answer" : "Send"} icon={Icon.Message} onSubmit={submit} />
          <Action title="Open in Hive" icon={Icon.AppWindow} onAction={() => goTo(chat)} />
        </ActionPanel>
      }
    >
      {asking
        ? questions.flatMap((question, i) => {
            const options = question.options || [];
            const pick = question.multiSelect ? (
              <Form.TagPicker key={`pick-${i}`} id={`pick-${i}`} title={question.header || "Answer"}>
                {options.map((one) => <Form.TagPicker.Item key={one.label} value={one.label} title={one.label} />)}
              </Form.TagPicker>
            ) : (
              <Form.Dropdown key={`pick-${i}`} id={`pick-${i}`} title={question.header || "Answer"} info={question.question}>
                {options.map((one) => <Form.Dropdown.Item key={one.label} value={one.label} title={one.label} />)}
              </Form.Dropdown>
            );
            return [
              <Form.Description key={`q-${i}`} title={`Question ${i + 1}`} text={question.question} />,
              pick,
              <Form.TextField key={`other-${i}`} id={`other-${i}`} title="Or write it" placeholder="Leave empty to send the option above" />
            ];
          })
        : [
            <Form.Description key="now" title={chat.title} text={chat.now || chat.mission.slice(0, 280)} />,
            <Form.TextArea key="text" id="text" title="Message" autoFocus />
          ]}
    </Form>
  );
}

export default function GoToChat() {
  const { socket } = getPreferenceValues();
  const client = hiveClient(socket);
  const [sections, setSections] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    client.hive().then((hive) => { setSections(groupChats(hive)); setError(""); }).catch((wrong) => setError(wrong.message));
  }, [socket]);

  useEffect(() => {
    load();
    const every = setInterval(load, 4000);
    return () => clearInterval(every);
  }, [load]);

  if (error && !sections) {
    return (
      <List>
        <List.EmptyView icon={Icon.ExclamationMark} title="Could not reach Hive" description={error} actions={<ActionPanel><Action title="Try Again" icon={Icon.ArrowClockwise} onAction={load} /></ActionPanel>} />
      </List>
    );
  }

  return (
    <List isLoading={!sections} isShowingDetail searchBarPlaceholder="Search chats by title or mission">
      <List.EmptyView icon={Icon.Message} title="No chats open" description="Open one with New Hive Chat." />
      {(sections || []).map((section) => (
        <List.Section key={section.key} title={section.title} subtitle={String(section.chats.length)}>
          {section.chats.map((chat) => (
            <List.Item
              key={`${chat.where}:${chat.name}`}
              icon={{ source: Icon.CircleFilled, tintColor: TINT[section.key] }}
              title={chat.title}
              keywords={[chat.name, chat.mission.slice(0, 120)]}
              accessories={[accessory(section.key, chat)]}
              subtitle={section.key === "waiting" && chat.questions[0] ? chat.questions[0].header || "" : ""}
              detail={
                <List.Item.Detail
                  markdown={detailOf(chat)}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.TagList title="State">
                        <List.Item.Detail.Metadata.TagList.Item text={accessory(section.key, chat).tag?.value || "quiet"} color={TINT[section.key]} />
                      </List.Item.Detail.Metadata.TagList>
                      {chat.model ? <List.Item.Detail.Metadata.Label title="Model" text={chat.model} icon={Icon.ComputerChip} /> : null}
                      <List.Item.Detail.Metadata.Label title="Runs on" text={chat.where === "cloud" ? "Cloud" : "This Mac"} icon={chat.where === "cloud" ? Icon.Cloud : Icon.Desktop} />
                      <List.Item.Detail.Metadata.Label title="Seat" text={chat.name} />
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action title="Open in Hive" icon={Icon.AppWindow} onAction={() => goTo(chat)} />
                  {chat.state !== "starting" ? (
                    <Action.Push title={chat.questions.length ? "Answer from Here" : "Reply from Here"} icon={Icon.Message} shortcut={{ modifiers: ["cmd"], key: "r" }} target={<Reply chat={chat} client={client} done={load} />} />
                  ) : null}
                  <Action.CopyToClipboard title="Copy Chat Link" content={seatLink(chat.name)} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
