/**
 * kra- SolidJS 风格的 React 响应式系统
 *
 * component(fn) 中 fn 只执行一次（setup），返回渲染函数 () => JSX。
 * 也可以直接返回 JSX（自动按索引复用 signal/effect，跳过重复副作用）。
 *
 * @example
 *   // 推荐：返回渲染函数（setup 真正只执行一次）
 *   const Counter = component(() => {
 *     const count = signal(0);
 *     createEffect(() => console.log(count()));
 *     return () => <button onClick={() => count(c=>c+1)}>{count()}</button>;
 *   });
 *
 *   // 简写：直接返回 JSX（也可以，setup 语义由框架保证）
 *   const Counter = component(() => {
 *     const count = signal(0);
 *     return <button onClick={() => count(c=>c+1)}>{count()}</button>;
 *   });
 */

import React from 'react';

// ============================================================
//  核心响应式引擎
// ============================================================

let activeTracker = null;
const trackerStack = [];
let batchDepth = 0;
const pendingNotifications = new Set();

function track(subscribers) {
  if (activeTracker) {
    subscribers.add(activeTracker);
    activeTracker._deps.add(subscribers);
  }
}

function trigger(subscribers) {
  const trackers = [...subscribers];
  for (const tracker of trackers) {
    if (batchDepth > 0) {
      pendingNotifications.add(tracker);
    } else {
      tracker._notify();
    }
  }
}

function cleanupTracker(tracker) {
  for (const depSet of tracker._deps) {
    depSet.delete(tracker);
  }
  tracker._deps.clear();
}

function runWithTracker(tracker, fn) {
  trackerStack.push(activeTracker);
  activeTracker = tracker;
  try {
    return fn();
  } finally {
    activeTracker = trackerStack.pop();
  }
}

// ============================================================
//  批量更新 & 工具
// ============================================================

export function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const effects = [...pendingNotifications];
      pendingNotifications.clear();
      for (const effect of effects) {
        effect._notify();
      }
    }
  }
}

export function untrack(fn) {
  trackerStack.push(activeTracker);
  activeTracker = null;
  try {
    return fn();
  } finally {
    activeTracker = trackerStack.pop();
  }
}

// ============================================================
//  Owner 上下文（component 内部状态）
// ============================================================

let currentOwner = null;

// 用 React Context 在组件树中传递 owner，使子组件能在渲染时找到父 owner
const OwnerContext = React.createContext(null);

// ============================================================
//  Context 注入系统（provide / inject）
// ============================================================

/**
 * share(key, value) — 在当前组件中向后代注入值。
 *
 * 必须在 component() 的 setup 阶段调用。
 * 子组件通过 inject(key) 获取，无需逐层传递 props。
 *
 * @param {string|symbol} key  注入的键名
 * @param {*} value  要注入的值（可以是 signal、普通值、对象等）
 *
 * @example
 *   const Parent = component(() => {
 *     const theme = signal('dark');
 *     share('theme', theme);
 *     return () => <Child />;
 *   });
 */
export function share(key, value) {
  const owner = currentOwner;
  if (!owner) {
    console.warn('share() must be called inside a component setup.');
    return;
  }
  if (!owner._provided) owner._provided = {};
  owner._provided[key] = value;
}

/**
 * inject(key, fallback?) — 获取最近祖辈 share 的值。
 *
 * 沿 owner 父链向上查找；找不到则返回 fallback（若提供），否则返回 undefined。
 *
 * 必须在 component() 的 setup 阶段调用。
 *
 * @param {string|symbol} key  注入的键名（与 share 的 key 对应）
 * @param {*} [fallback]  可选的后备值（找不到时返回）
 * @returns {*}
 *
 * @example
 *   const Child = component(() => {
 *     const theme = inject('theme');       // signal('dark')
 *     return () => <span>当前主题: {theme()}</span>;
 *   });
 */
export function want(key, fallback) {
  const owner = currentOwner;
  if (!owner) {
    // console.warn('inject() must be called inside a component setup.');
    return fallback();
  }

  // 沿 parent 链向上查找
  let cur = owner.parent;
  while (cur) {
    if (cur._provided && key in cur._provided) {
      return cur._provided[key];
    }
    cur = cur.parent;
  }

  // 没找到，返回 fallback
  return fallback();
}

// ============================================================
//  createSignal
// ============================================================

export function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  function sig(...args) {
    if (args.length === 0) {
      track(subscribers);
      return value;
    }
    const nextValue =
      typeof args[0] === 'function' ? args[0](value) : args[0];
    if (!Object.is(value, nextValue)) {
      value = nextValue;
      trigger(subscribers);
    }
  }

  sig.peek = () => value;
  return sig;
}

// ============================================================
//  createComputed
// ============================================================

export function createComputed(computeFn) {
  let cachedValue;
  let dirty = true;
  const subscribers = new Set();

  const innerTracker = {
    _deps: new Set(),
    _notify() {
      if (!dirty) {
        dirty = true;
        trigger(subscribers);
      }
    },
  };

  function computed() {
    track(subscribers);
    if (dirty) {
      cleanupTracker(innerTracker);
      cachedValue = runWithTracker(innerTracker, computeFn);
      dirty = false;
    }
    return cachedValue;
  }

  computed.peek = () => {
    if (dirty) {
      cleanupTracker(innerTracker);
      cachedValue = runWithTracker(innerTracker, computeFn);
      dirty = false;
    }
    return cachedValue;
  };

  return computed;
}

// ============================================================
//  createEffect
// ============================================================

/**
 * createEffect(fn) — 在 component 内自动注册到 owner，卸载时 dispose。
 *
 * 在 component 的"直接返回 JSX"模式下，通过索引复用避免重复创建。
 */
export function createEffect(effectFn) {
  const owner = currentOwner;

  // ---- 组件内 ----
  if (owner) {
    if (owner.mode === 'render-fn') {
      // 模式 A（返回渲染函数）：setup 只执行一次，直接创建
      const entry = _makeEffect(effectFn);
      owner.disposables.push(entry.dispose);
      return entry.dispose;
    }

    // 模式 B（直接返回 JSX）：通过索引复用
    const idx = owner.effectIndex++;
    if (idx < owner.effects.length) {
      // re-render：更新回调引用，不重新创建
      owner.effects[idx].updateFn(effectFn);
      return owner.effects[idx].dispose;
    }
    // 首次：创建
    const entry = _makeEffectUpdatable(effectFn);
    owner.effects.push(entry);
    owner.disposables.push(entry.dispose);
    return entry.dispose;
  }

  // ---- 组件外 ----
  return _makeEffect(effectFn).dispose;
}

/** 创建不可更新的 effect（用于组件外和模式 A） */
function _makeEffect(effectFn) {
  let cleanupFn = null;
  let active = true;
  const tracker = {
    _deps: new Set(),
    _notify() { if (active) execute(); },
  };

  function execute() {
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (e) { console.error('Effect cleanup error:', e); }
    }
    cleanupTracker(tracker);
    cleanupFn = runWithTracker(tracker, effectFn);
  }

  function dispose() {
    if (!active) return;
    active = false;
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (e) { console.error('Effect cleanup error:', e); }
    }
    cleanupTracker(tracker);
  }

  execute();
  return { dispose };
}

/** 创建可更新回调的 effect（用于模式 B 索引复用） */
function _makeEffectUpdatable(effectFn) {
  let currentFn = effectFn;
  let cleanupFn = null;
  let active = true;
  const tracker = {
    _deps: new Set(),
    _notify() { if (active) execute(); },
  };

  function execute() {
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (e) { console.error('Effect cleanup error:', e); }
    }
    cleanupTracker(tracker);
    cleanupFn = runWithTracker(tracker, () => currentFn());
  }

  function dispose() {
    if (!active) return;
    active = false;
    if (typeof cleanupFn === 'function') {
      try { cleanupFn(); } catch (e) { console.error('Effect cleanup error:', e); }
    }
    cleanupTracker(tracker);
  }

  function updateFn(fn) { currentFn = fn; }

  execute();
  return { dispose, updateFn };
}

// ============================================================
//  signal — 等同 createSignal（简写 API）
// ============================================================

export function signal(initialValue) {
  const owner = currentOwner;

  // 模式 B（直接返回 JSX）：通过索引复用
  if (owner && owner.mode === 'jsx') {
    const idx = owner.signalIndex++;
    if (idx < owner.signals.length) {
      return owner.signals[idx];
    }
    const sig = createSignal(initialValue);
    owner.signals.push(sig);
    return sig;
  }

  // 模式 A 或组件外：直接创建
  return createSignal(initialValue);
}

// ============================================================
//  onCleanup — 注册组件卸载清理回调
// ============================================================

export function onCleanup(fn) {
  const owner = currentOwner;
  if (!owner) return;

  if (owner.mode === 'render-fn') {
    // 模式 A：setup 只执行一次，直接注册
    owner.disposables.push(fn);
    return;
  }

  // 模式 B：只在首次 setup 时注册（signals 还在增长阶段 = 首次）
  if (owner.signalIndex > owner.signals.length) {
    return; // re-render，跳过
  }
  // 用一个 Set 来避免重复注册
  if (!owner._cleanupSet) owner._cleanupSet = new Set();
  if (!owner._cleanupSet.has(fn)) {
    owner._cleanupSet.add(fn);
    owner.disposables.push(fn);
  }
}

// ============================================================
//  component()
// ============================================================

/**
 * component(setupFn) — 将 setup 函数包装为 React 组件。
 *
 * setupFn 可以：
 *   模式 A: return () => JSX  — setup 真正只执行一次（推荐）
 *   模式 B: return JSX        — 自动索引复用（简单组件）
 */
export function component(setupFn) {
  const displayName = setupFn.name || 'SuperStateComponent';

  function SuperStateComponent(props) {
    const [, forceRender] = React.useReducer((x) => x + 1, 0);
    const ref = React.useRef(null);

    // 通过 React Context 获取父 owner（跨渲染周期稳定传递）
    const parentOwner = React.useContext(OwnerContext);

    // ======== 首次渲染 ========
    if (!ref.current) {
      const owner = {
        mode: null,       // 'render-fn' | 'jsx'
        disposables: [],  // effect dispose + onCleanup 回调
        tracker: {
          _deps: new Set(),
          _notify: () => forceRender(),
        },
        // 模式 A 专属
        renderFn: null,
        // 模式 B 专属
        signals: [],
        signalIndex: 0,
        effects: [],
        effectIndex: 0,
        // context 注入：通过 React Context 获取父 owner
        parent: parentOwner,
        _provided: null,
      };

      // 在 owner 上下文中执行 setup（不在渲染追踪上下文中）
      const prevOwner = currentOwner;
      currentOwner = owner;
      // 先假设是模式 A
      owner.mode = 'render-fn';
      let setupResult;
      try {
        setupResult = setupFn(props);
      } finally {
        currentOwner = prevOwner;
      }

      if (typeof setupResult === 'function') {
        // 模式 A 确认：返回了渲染函数
        owner.renderFn = setupResult;
      } else {
        // 模式 B：直接返回了 JSX
        // 需要重新执行一次 setup 来建立索引复用体系
        // 先清理刚才 setup 中可能创建的 effects
        for (const fn of owner.disposables) {
          try { if (typeof fn === 'function') fn(); } catch (_) {}
        }
        owner.disposables = [];
        owner.mode = 'jsx';
        owner.signalIndex = 0;
        owner.effectIndex = 0;

        // 重新执行 setupFn，这次 signal/createEffect/onCleanup 会走索引复用路径
        const prevOwner2 = currentOwner;
        currentOwner = owner;
        try {
          // 在追踪上下文中执行，建立渲染依赖
          setupResult = runWithTracker(owner.tracker, () => setupFn(props));
        } finally {
          currentOwner = prevOwner2;
        }
      }

      ref.current = { owner, initialJsx: setupResult };
    }

    const { owner } = ref.current;
    owner.tracker._notify = () => forceRender();

    // ======== 渲染 ========
    let jsx;

    if (owner.mode === 'render-fn') {
      // 模式 A：清理旧追踪，在追踪上下文中重新执行渲染函数
      cleanupTracker(owner.tracker);
      jsx = runWithTracker(owner.tracker, owner.renderFn);
    } else if (ref.current.initialJsx !== undefined) {
      // 模式 B 首次：初始化阶段已在追踪上下文中执行过，直接用结果
      // 不要 cleanupTracker，追踪已经建立好了
      jsx = ref.current.initialJsx;
      ref.current.initialJsx = undefined;
    } else {
      // 模式 B re-render：清理旧追踪，重置索引，重新执行 setupFn
      cleanupTracker(owner.tracker);
      owner.signalIndex = 0;
      owner.effectIndex = 0;
      const prevOwner = currentOwner;
      currentOwner = owner;
      try {
        jsx = runWithTracker(owner.tracker, () => setupFn(props));
      } finally {
        currentOwner = prevOwner;
      }
    }

    // ======== 卸载清理 ========
    React.useEffect(() => {
      return () => {
        const { owner: o } = ref.current;
        for (const fn of o.disposables) {
          try { if (typeof fn === 'function') fn(); }
          catch (e) { console.error('Cleanup error:', e); }
        }
        cleanupTracker(o.tracker);
      };
    }, []);

    // 通过 React Context 向子组件传递当前 owner
    return React.createElement(OwnerContext.Provider, { value: owner }, jsx);
  }

  SuperStateComponent.displayName = displayName;
  return SuperStateComponent;
}

// ============================================================
//  默认导出
// ============================================================

export default {
  signal,
  createEffect,
  component,
  batch,
  untrack,
  onCleanup,
  createSignal,
  createComputed,
  share,
  want,
};
