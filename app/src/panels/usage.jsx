import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, Foot, Head, Icon } from "./window.jsx";

function Meter(props) {
  return (
    <div class={`limit ${props.meter.heat}`} classList={{ sub: props.meter.sub }}>
      <div class="top"><span class="name">{props.meter.name}</span><span class="pct">{props.meter.pct}</span></div>
      <div class="track"><i class="fill" style={{ width: `${props.meter.fill}%` }}></i></div>
      <Show when={props.meter.resets}><div class="resets">{props.meter.resets}</div></Show>
    </div>
  );
}

function Limits(props) {
  return (
    <Show when={props.limits}>
      <div class="panel-box limits-box">
        <h3>{props.limits.title}</h3>
        <p class="sub">{props.limits.sub}</p>
        <Show when={props.limits.held} fallback={<p class="usage-note">{props.limits.note}</p>}>
          <div class="limits">
            <For each={props.limits.held}>{(one) => (
              <Show when={one.account} fallback={<For each={one.meters}>{(meter) => <Meter meter={meter} />}</For>}>
                <div class="limit-account"><h4>{one.account}</h4>
                  <For each={one.meters}>{(meter) => <Meter meter={meter} />}</For></div>
              </Show>
            )}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

function Insights(props) {
  return (
    <Show when={props.insights}>
      <div class="panel-box insights-box">
        <h3>{props.insights.title}</h3>
        <p class="sub">{props.insights.sub}</p>
        <div class="insights">
          <For each={props.insights.rows}>{(row) => (
            <div class="ins"><span class="ipct">{row.percent}</span><span>{row.say}</span></div>
          )}</For>
        </div>
      </div>
    </Show>
  );
}

function Bars(props) {
  return (
    <>
      <div class="bars">
        <For each={props.bars.cols}>{(col) => (
          <div class="col" title={col.hint}>
            <Show when={col.top}><b>{col.top}</b></Show>
            <i style={{ height: `${col.height}%` }}></i>
          </div>
        )}</For>
      </div>
      <div class="axis"><For each={props.bars.cols}>{(col) => <span>{col.axis}</span>}</For></div>
    </>
  );
}

function Usage(props) {
  return (
    <Show when={!props.model.trouble} fallback={<p class="usage-note">{props.model.note}</p>}>
      <Show when={props.model.top} fallback={
        <>
          <div class="usage-top"><h2>{props.model.title}</h2></div>
          <div class="panel-row"><Limits limits={props.model.limits} /></div>
          <p class="usage-note">{props.model.note}</p>
        </>
      }>
      <div class="usage-top">
        <h2>{props.model.title}</h2>
        <span class="when">{props.model.top.when}</span>
        <span class="top-acts">
          <button class="btn" id="usage-refresh" onClick={() => props.actions.recompute()}>{props.model.top.refresh}</button>
          <button class="ghost" id="usage-close" onClick={() => props.actions.close()}>{props.model.top.closeSay} <kbd>esc</kbd></button>
        </span>
      </div>

      <div class="hero">
        <span class="number">{props.model.hero.peak}</span>
        <span class="says">{props.model.hero.lead}{" "}
          {props.model.hero.average} <b>{props.model.hero.mean}</b> {props.model.hero.active}{" "}
          <b>{props.model.hero.minutes}</b> {props.model.hero.tail}</span>
      </div>

      <div class="tiles">
        <For each={props.model.tiles}>{(tile) => (
          <div class="tile-n"><span class="label">{tile.label}</span><span class="val" innerHTML={tile.value} /></div>
        )}</For>
      </div>

      <div class="panel-row">
        <div class="panel-box">
          <h3>{props.model.calendar.title}</h3>
          <p class="sub">{props.model.calendar.sub}</p>
          <div class="cal">
            <div class="weekdays"><For each={props.model.calendar.weekdays}>{(d) => <span>{d.say}</span>}</For></div>
            <For each={props.model.calendar.weeks}>{(week) => (
              <div class="week"><For each={week.cells}>{(cell) => (
                <span class="cell" classList={{ today: cell.today }} data-n={cell.n} title={cell.hint} />
              )}</For></div>
            )}</For>
          </div>
          <div class="scale">{props.model.calendar.less} <For each={props.model.calendar.steps}>{(step) => <span class="cell" data-n={step.n} />}</For> {props.model.calendar.more}</div>
        </div>
        <Limits limits={props.model.limits} />
        <Insights insights={props.model.insights} />
      </div>

      <div class="panel-box">
        <h3>{props.model.atOnce.title}</h3>
        <p class="sub">{props.model.atOnce.sub}</p>
        <Bars bars={props.model.atOnce} />
      </div>

      <div class="panel-box">
        <h3>{props.model.hourly.title}</h3>
        <p class="sub">{props.model.hourly.sub}</p>
        <Bars bars={props.model.hourly} />
        <div class="ribbon"><For each={props.model.hourly.ribbon}>{(one) => (
          <i style={{ background: one.tint }} title={one.hint} />
        )}</For></div>
      </div>

        <p class="usage-note" innerHTML={props.model.foot} />
      </Show>
    </Show>
  );
}


function ChartBars(props) {
  return (
    <div class="us-chart" classList={{ wide: props.wide }}>
      <h4>{props.bars.title}<Show when={props.bars.unit}><span class="pw-m">{props.bars.unit}</span></Show></h4>
      <Show when={props.wide}><p class="us-sub">{props.bars.sub}</p></Show>
      <div class="bars" classList={{ thin: props.bars.cols.length > 12 }}>
        <For each={props.bars.cols}>{(col) => (
          <div class="col" classList={{ peak: !!col.top }} title={col.hint}>
            <Show when={col.top && props.wide}><b>{col.top}</b></Show>
            <i style={{ height: `${col.height}%` }}></i>
          </div>
        )}</For>
      </div>
      <div class="axis"><For each={props.bars.cols}>{(col) => <span>{col.axis}</span>}</For></div>
      <Show when={props.bars.ribbon && props.wide}>
        <div class="ribbon"><For each={props.bars.ribbon}>{(one) => <i style={{ background: one.tint }} title={one.hint} />}</For></div>
      </Show>
    </div>
  );
}

function MeterCard(props) {
  return (
    <div class="us-meter" classList={{ hot: !!props.meter.heat, key: props.meter.key === 0 }}>
      <span class="us-lbl">{props.meter.name}<Show when={props.meter.badge}><span class="rc-badge mono">{props.meter.badge}</span></Show></span>
      <span class="us-big">{props.meter.n}<small>%</small></span>
      <span class="us-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={props.meter.fill} aria-label={props.meter.name}><i style={{ width: `${props.meter.fill}%` }} /></span>
      <span class="pw-m">{props.meter.resets}<Show when={props.meter.heat}>{` · ${props.meter.hotSay}`}</Show></span>
    </div>
  );
}

function Stats(props) {
  return (
    <div class="us-stats">
      <For each={props.stats}>{(one) => (
        <div class="us-stat"><span class="pw-cap">{one.label}</span><span class="us-big">{one.value}<small>{one.small}</small></span></div>
      )}</For>
    </div>
  );
}

function Calendar(props) {
  const c = () => props.calendar;
  return (
    <div class="us-chart wide">
      <h4>{c().title}</h4>
      <p class="us-sub">{c().sub}</p>
      <div class="cal">
        <div class="weekdays"><For each={c().weekdays}>{(d) => <span>{d.say}</span>}</For></div>
        <For each={c().weeks}>{(week) => (
          <div class="week"><For each={week.cells}>{(cell) => (
            <span class="cell" classList={{ today: cell.today }} data-n={cell.n} title={cell.hint} />
          )}</For></div>
        )}</For>
      </div>
      <div class="scale">{c().less} <For each={c().steps}>{(step) => <span class="cell" data-n={step.n} />}</For> {c().more}</div>
    </div>
  );
}

function Waiting(props) {
  return (
    <div class="us-wait">
      <p class="pw-load"><span class="pw-spin" aria-hidden="true" />{props.say}</p>
      <p class="us-sub">{props.hint}</p>
    </div>
  );
}

function Detail(props) {
  const m = () => props.model;
  const d = () => props.model.detail;
  return (
    <div class="pw-detail us-detail">
      <Show when={d()} fallback={<Empty empty={m().blank} />}>
        <h2 class="pw-h1">{d().title}</h2>
        <div class="pw-strip"><For each={d().strip}>{(bit) => <span>{bit}</span>}</For></div>
        <Show when={d().kind === "account"}>
          <Show when={d().meters.length} fallback={<p class="pw-st warn"><Icon id="i-warn" />{d().quiet}</p>}>
            <div class="us-meters"><For each={d().meters}>{(meter) => <MeterCard meter={meter} />}</For></div>
          </Show>
          <Show when={m().stats} fallback={<Waiting say={m().note} hint={m().waitHint} />}>
            <Stats stats={m().stats} />
            <div class="us-charts"><ChartBars bars={m().atOnce} /><ChartBars bars={m().hourly} /></div>
          </Show>
        </Show>
        <Show when={d().kind === "atOnce"}>
          <Show when={m().stats} fallback={<Waiting say={m().note} hint={m().waitHint} />}>
            <p class="us-hero"><span class="us-big">{m().hero.peak}</span> {m().hero.lead} {m().hero.average} <b>{m().hero.mean}</b> {m().hero.active} <b>{m().hero.minutes}</b> {m().hero.tail}</p>
            <Stats stats={m().stats} />
            <ChartBars bars={m().atOnce} wide />
            <Show when={m().insights}>
              <div class="us-chart wide">
                <h4>{m().insights.title}</h4>
                <p class="us-sub">{m().insights.sub}</p>
                <div class="insights"><For each={m().insights.rows}>{(row) => <div class="ins"><span class="ipct">{row.percent}</span><span>{row.say}</span></div>}</For></div>
              </div>
            </Show>
          </Show>
        </Show>
        <Show when={d().kind === "hours"}>
          <Show when={m().stats} fallback={<Waiting say={m().note} hint={m().waitHint} />}><ChartBars bars={m().hourly} wide /></Show>
        </Show>
        <Show when={d().kind === "days"}>
          <Show when={m().stats} fallback={<Waiting say={m().note} hint={m().waitHint} />}>
            <Calendar calendar={m().calendar} />
            <div class="tiles">
              <For each={m().tiles}>{(tile) => <div class="tile-n"><span class="label">{tile.label}</span><span class="val" innerHTML={tile.value} /></div>}</For>
            </div>
            <p class="usage-note" innerHTML={m().foot} />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function UsageWindow(props) {
  const m = () => props.model;
  return (
    <>
      <Head head={m().head} actions={props.actions} />
      <div class="pw-body">
        <div class="pw-list" role="listbox" aria-label={m().head.title}>
          <For each={m().sections}>{(section) => (
            <>
              <div class="pw-sec">{section.say}<span class="n">{section.count}</span></div>
              <For each={section.rows}>{(row) => (
                <button type="button" class="pw-row us-row" classList={{ off: row.off, gauge: row.share !== null }} role="option" aria-selected={row.here ? "true" : "false"}
                  data-key={row.key} title={row.hint} onClick={() => props.actions.pick(row.key)}>
                  <Icon id={row.icon} />
                  <span class="pw-txt"><span class="pw-t">{row.name}</span><span class="pw-m">{row.sub}</span></span>
                  <Show when={row.share !== null} fallback={<span />}>
                    <span class="us-mini" classList={{ hot: row.hot }}><i style={{ width: `${row.share}%` }} /></span>
                  </Show>
                  <Show when={row.pct}><span class="us-pct">{row.pct}</span></Show>
                </button>
              )}</For>
            </>
          )}</For>
        </div>
        <Detail model={m()} />
      </div>
      <Foot foot={m().bar} actions={props.actions} />
    </>
  );
}

function UsagePanel(props) {
  return <Show when={props.model.raycast} fallback={<Usage model={props.model} actions={props.actions} />}><UsageWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountUsage(host, extras) {
  return mountView(host, UsagePanel, { top: null, title: "", note: "", limits: null }, extras, { lazy: true });
}
