import { Action, ActionPanel, Form, Icon, Toast, closeMainWindow, getPreferenceValues, getSelectedText, open, popToRoot, showHUD, showToast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { hiveClient, settledName } from "./hive.mjs";
import { engines, missionWith, seatLink, spawnBody } from "./shape.mjs";

export default function NewChat() {
  const { socket } = getPreferenceValues();
  const client = useMemo(() => hiveClient(socket), [socket]);
  const [selected, setSelected] = useState("");
  const [sending, setSending] = useState(false);
  const [found, setFound] = useState([]);
  const [agent, setAgent] = useState("claude");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("default");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSelectedText().then((text) => setSelected(String(text || "").trim())).catch(() => setSelected(""));
    client.providers().then((list) => setFound(engines(list))).catch(() => setFound([])).finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    setModels([]);
    client.catalog(agent).then((catalog) => setModels(catalog.models || [])).catch(() => setModels([]));
  }, [client, agent]);

  const engine = found.find((one) => one.id === agent);
  const efforts = models.find((one) => one.value === model)?.efforts || [];

  async function submit(values) {
    const prompt = missionWith(values.mission, values.attach ? selected : "");
    if (!prompt) {
      await showToast({ style: Toast.Style.Failure, title: "Write the mission first" });
      return;
    }
    setSending(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Opening the chat…" });
    try {
      const job = await client.spawn(spawnBody({ prompt, agent, model: values.model, effort: values.effort, account: values.account }));
      if (values.after === "open") {
        const name = await settledName(client, job);
        await open(seatLink(name));
        await toast.hide();
        await closeMainWindow();
      } else {
        await showHUD("Chat opened in Hive. It will let you know when it answers");
      }
      await popToRoot({ clearSearchBar: true });
    } catch (wrong) {
      toast.style = Toast.Style.Failure;
      toast.title = "The chat did not open";
      toast.message = wrong.message;
      setSending(false);
    }
  }

  return (
    <Form
      isLoading={sending || loading}
      navigationTitle="New Hive Chat"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Open Chat" icon={Icon.Message} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="mission" title="Mission" placeholder="What should the chat do? Write it the way you would in Hive." info="The chat starts working as soon as it opens." autoFocus enableMarkdown />
      {selected ? <Form.Checkbox id="attach" title="Selected text" label="Send it along, quoted under the mission" defaultValue={true} info={selected.slice(0, 400)} /> : null}

      <Form.Separator />

      {found.length > 1 ? (
        <Form.Dropdown id="agent" title="Engine" value={agent} onChange={(value) => { setAgent(value); setModel("default"); }}>
          {found.map((one) => <Form.Dropdown.Item key={one.id} value={one.id} title={one.title} icon={Icon.Stars} />)}
        </Form.Dropdown>
      ) : null}
      <Form.Dropdown id="model" title="Model" value={model} onChange={setModel} isLoading={!models.length}>
        {(models.length ? models : [{ value: "default", label: "Default" }]).map((one) => (
          <Form.Dropdown.Item key={one.value} value={one.value} title={one.label} icon={one.isDefault ? Icon.CheckCircle : Icon.ComputerChip} />
        ))}
      </Form.Dropdown>
      {efforts.length ? (
        <Form.Dropdown id="effort" title="Effort" defaultValue="" storeValue>
          <Form.Dropdown.Item value="" title="Model default" icon={Icon.Gauge} />
          {efforts.map((one) => <Form.Dropdown.Item key={one.value} value={one.value} title={one.label} icon={Icon.Gauge} />)}
        </Form.Dropdown>
      ) : null}
      {engine && engine.accounts.length > 1 ? (
        <Form.Dropdown id="account" title="Account" defaultValue="default" storeValue>
          {engine.accounts.map((one) => <Form.Dropdown.Item key={one} value={one} title={one} icon={Icon.Person} />)}
        </Form.Dropdown>
      ) : null}

      <Form.Separator />

      <Form.Dropdown id="after" title="After it opens" defaultValue="stay" storeValue>
        <Form.Dropdown.Item value="stay" title="Stay where I am" icon={Icon.Eye} />
        <Form.Dropdown.Item value="open" title="Go to the chat in Hive" icon={Icon.AppWindow} />
      </Form.Dropdown>
      <Form.Description text="⌘↵ opens the chat. Hive tells you when it answers." />
    </Form>
  );
}
