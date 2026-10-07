import { Action, ActionPanel, Color, Icon, List, closeMainWindow, environment, getPreferenceValues, open } from "@raycast/api";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect, useMemo, useState } from "react";
import { hiveClient } from "./hive.mjs";
import { SHELF_FILTERS, bucketed, pageMatches, shelfLink, shelfRows } from "./shape.mjs";

const STATE = {
  draft: { label: "Draft", color: Color.Orange },
  "in-review": { label: "In review", color: Color.Blue },
  decided: { label: "Decided", color: Color.Purple },
  delivered: { label: "Delivered", color: Color.Green },
  closed: { label: "Closed", color: Color.SecondaryText }
};

const KIND = {
  documento: { icon: Icon.Document, label: "Document" },
  telas: { icon: Icon.Mobile, label: "Screens" },
  plano: { icon: Icon.CheckList, label: "Plan" },
  lente: { icon: Icon.Map, label: "PR lens" }
};

function kindOf(page) {
  return KIND[page.kind] || { icon: Icon.Document, label: page.kind || "Page" };
}

function ago(at) {
  if (!at) return "";
  return new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function useThumb(client, page) {
  const [path, setPath] = useState("");
  useEffect(() => {
    setPath("");
    if (!page?.thumb) return;
    const dir = join(environment.supportPath, "thumbs");
    const file = join(dir, `${page.slug}-${page.thumb.tab}-${page.thumb.version}.png`);
    client
      .thumb(page.slug, page.thumb.tab, page.thumb.version)
      .then((bytes) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, bytes);
        setPath(file);
      })
      .catch(() => setPath(""));
  }, [client, page?.slug, page?.thumb?.version]);
  return path;
}

function PageDetail({ client, page, selected }) {
  const thumb = useThumb(client, selected ? page : null);
  const state = STATE[page.state];
  const kind = kindOf(page);
  const markdown = thumb ? `![${page.title}](${encodeURI(`file://${thumb}`)}?raycast-height=260)` : `## ${page.title}`;
  return (
    <List.Item.Detail
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Title" text={page.title} />
          {state ? (
            <List.Item.Detail.Metadata.TagList title="State">
              <List.Item.Detail.Metadata.TagList.Item text={state.label} color={state.color} />
            </List.Item.Detail.Metadata.TagList>
          ) : null}
          <List.Item.Detail.Metadata.Label title="Owner" text={page.owner || "unknown"} icon={Icon.Person} />
          <List.Item.Detail.Metadata.Label title="Updated" text={ago(page.at)} icon={Icon.Clock} />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.TagList title="Tabs">
            {page.tabs.map((tab) => <List.Item.Detail.Metadata.TagList.Item key={tab} text={(KIND[tab] || { label: tab }).label} />)}
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Label title="Versions" text={String(page.versions)} />
          {page.leaf ? <List.Item.Detail.Metadata.Link title="Leaf" target={page.leaf} text="Open in the Leaf" /> : null}
          <List.Item.Detail.Metadata.Label title="Opens as" text={kind.label} icon={kind.icon} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}

export default function OpenShelf() {
  const { socket } = getPreferenceValues();
  const client = useMemo(() => hiveClient(socket), [socket]);
  const [shelf, setShelf] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [picked, setPicked] = useState("");

  useEffect(() => {
    client.shelf().then(setShelf).catch((wrong) => setError(wrong.message));
  }, [client]);

  const groups = useMemo(() => {
    if (!shelf) return [];
    return bucketed(shelfRows(shelf).filter((page) => pageMatches(page, filter, shelf.me)));
  }, [shelf, filter]);

  if (error) {
    return (
      <List>
        <List.EmptyView icon={Icon.ExclamationMark} title="Could not reach Hive" description={error} />
      </List>
    );
  }

  return (
    <List
      isLoading={!shelf}
      isShowingDetail
      searchBarPlaceholder="Search the shelf by title"
      onSelectionChange={(id) => setPicked(id || "")}
      searchBarAccessory={
        <List.Dropdown tooltip="Which pages" storeValue onChange={setFilter}>
          {SHELF_FILTERS.map((one) => <List.Dropdown.Item key={one.value} value={one.value} title={one.title} />)}
        </List.Dropdown>
      }
    >
      <List.EmptyView icon={Icon.Document} title="No page here" description="Try another filter or search." />
      {groups.map((group) => (
        <List.Section key={group.title} title={group.title} subtitle={String(group.rows.length)}>
          {group.rows.map((page) => {
            const state = STATE[page.state];
            const kind = kindOf(page);
            return (
              <List.Item
                key={page.slug}
                id={page.slug}
                icon={{ source: kind.icon, tintColor: state ? state.color : Color.SecondaryText }}
                title={page.title}
                keywords={[page.slug, page.owner, ...page.tabs]}
                detail={<PageDetail client={client} page={page} selected={picked === page.slug} />}
                actions={
                  <ActionPanel>
                    <Action
                      title="Open in Hive"
                      icon={Icon.AppWindow}
                      onAction={async () => {
                        await open(shelfLink(page.slug, page.kind));
                        await closeMainWindow({ clearRootSearch: true });
                      }}
                    />
                    {page.leaf ? <Action.OpenInBrowser title="Open in Leaf" url={page.leaf} shortcut={{ modifiers: ["cmd"], key: "o" }} /> : null}
                    {page.leaf ? <Action.CopyToClipboard title="Copy Leaf Link" content={page.leaf} shortcut={{ modifiers: ["cmd", "shift"], key: "c" }} /> : null}
                    <Action.CopyToClipboard title="Copy Hive Link" content={shelfLink(page.slug, page.kind)} shortcut={{ modifiers: ["cmd", "shift"], key: "h" }} />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      ))}
    </List>
  );
}
