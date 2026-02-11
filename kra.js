import React from 'react';

let active = null, currentOwner = null, depth = 0;
const stack = [], pending = new Set();
const OwnerContext = React.createContext(null);
const safe = (fn, msg) => { try { return fn?.(); } catch (e) { console.error(msg, e); } };
const track = (subs) => active && (subs.add(active), active._deps.add(subs));
const trigger = (subs) => [...subs].forEach((t) => (depth ? pending.add(t) : t._notify()));
const cleanup = (t) => { for (const s of t._deps) s.delete(t); t._deps.clear(); };
const withTracker = (t, fn) => { stack.push(active); active = t; try { return fn(); } finally { active = stack.pop(); } };

export function batch(fn) {
  depth++;
  try { return fn(); } finally {
    if (--depth === 0) { const list = [...pending]; pending.clear(); list.forEach((t) => t._notify()); }
  }
}

export const untrack = (fn) => withTracker(null, fn);
export const signal = (v) => createSignal(v);
export const onCleanup = (fn) => currentOwner?.disposables.push(fn);

export function share(key, value) {
  if (!currentOwner) return console.warn('share() must be called inside a component setup.');
  (currentOwner._provided ||= {})[key] = value;
}

export function want(key, fallback) {
  for (let o = currentOwner?.parent; o; o = o.parent) if (o._provided && key in o._provided) return o._provided[key];
  return typeof fallback === 'function' ? fallback() : fallback;
}

export function createSignal(v) {
  const subs = new Set();
  function sig(...args) {
    if (!args.length) return track(subs), v;
    const nv = typeof args[0] === 'function' ? args[0](v) : args[0];
    if (!Object.is(v, nv)) v = nv, trigger(subs);
  }
  sig.peek = () => v;
  return sig;
}

export function createComputed(fn) {
  let value, dirty = true;
  const subs = new Set(), t = { _deps: new Set(), _notify: () => !dirty && (dirty = true, trigger(subs)) };
  const evalIfNeed = () => (dirty && (cleanup(t), value = withTracker(t, fn), dirty = false), value);
  const c = () => (track(subs), evalIfNeed());
  c.peek = evalIfNeed;
  return c;
}

function makeEffect(fn) {
  let c, alive = true;
  const t = { _deps: new Set(), _notify: () => alive && run() };
  const run = () => { safe(c, 'Effect cleanup error:'); cleanup(t); c = withTracker(t, fn); };
  const dispose = () => { if (!alive) return; alive = false; safe(c, 'Effect cleanup error:'); cleanup(t); };
  run();
  return dispose;
}

export function createEffect(fn) {
  const dispose = makeEffect(fn);
  currentOwner?.disposables.push(dispose);
  return dispose;
}

export function unit(setup) {
  function Comp(props) {
    const [, force] = React.useReducer((x) => x + 1, 0), ref = React.useRef(), parent = React.useContext(OwnerContext);
    if (!ref.current) {
      const owner = { disposables: [], tracker: { _deps: new Set(), _notify: () => force() }, renderFn: null, parent, _provided: null };
      const prev = currentOwner; currentOwner = owner;
      let out; try { out = setup(props); } finally { currentOwner = prev; }
      if (typeof out !== 'function') throw new Error(`[kra] unit(${setup.name || 'anonymous'}) setup 必须返回 () => JSX，当前为 ${typeof out}`);
      owner.renderFn = out; ref.current = { owner };
    }
    const { owner } = ref.current; owner.tracker._notify = () => force();
    cleanup(owner.tracker); const jsx = withTracker(owner.tracker, owner.renderFn);
    React.useEffect(() => () => { for (const fn of owner.disposables) safe(fn, 'Cleanup error:'); cleanup(owner.tracker); }, []);
    return React.createElement(OwnerContext.Provider, { value: owner }, jsx);
  }
  Comp.displayName = setup.name || 'SuperStateComponent';
  return Comp;
}

export default { signal, createEffect, unit, batch, untrack, onCleanup, createSignal, createComputed, share, want };
