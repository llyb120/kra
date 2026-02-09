/**
 * SuperState 核心响应式引擎 - 单元测试
 *
 * 覆盖：
 *  1. createSignal    - 读/写/peek/函数式更新/类型
 *  2. createComputed  - 惰性求值、自动追踪、链式依赖
 *  3. createEffect    - 自动追踪、清理、dispose、条件依赖
 *  4. batch           - 合并通知、嵌套
 *  5. untrack         - 屏蔽追踪
 *  6. signal()        - 组件外使用（等同 createSignal）
 *  7. 综合场景
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createSignal,
  createComputed,
  createEffect,
  batch,
  untrack,
  signal,
} from './superstate.js';

// ============================================================
//  1. createSignal
// ============================================================
describe('createSignal', () => {
  it('应能读取初始值', () => {
    const count = createSignal(42);
    expect(count()).toBe(42);
  });

  it('应能设置新值并读取', () => {
    const count = createSignal(0);
    count(10);
    expect(count()).toBe(10);
  });

  it('支持函数式更新', () => {
    const count = createSignal(5);
    count((v) => v * 2);
    expect(count()).toBe(10);
    count((v) => v + 3);
    expect(count()).toBe(13);
  });

  it('相同值不应触发更新 (Object.is)', () => {
    const count = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { count(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    count(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('NaN === NaN 不应触发更新', () => {
    const val = createSignal(NaN);
    const spy = vi.fn();
    createEffect(() => { val(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    val(NaN);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('peek() 读取值但不收集依赖', () => {
    const count = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { count.peek(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    count(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('支持各种类型的值', () => {
    expect(createSignal('hello')()).toBe('hello');
    expect(createSignal({ a: 1 })()).toEqual({ a: 1 });
    expect(createSignal([1, 2])()).toEqual([1, 2]);
    expect(createSignal(null)()).toBeNull();
    expect(createSignal(undefined)()).toBeUndefined();
  });

  it('支持布尔值和 0', () => {
    const b = createSignal(true);
    b(false);
    expect(b()).toBe(false);
    const n = createSignal(1);
    n(0);
    expect(n()).toBe(0);
  });
});

// ============================================================
//  2. createComputed
// ============================================================
describe('createComputed', () => {
  it('应基于信号计算派生值', () => {
    const count = createSignal(3);
    const doubled = createComputed(() => count() * 2);
    expect(doubled()).toBe(6);
  });

  it('信号变化后应返回新的计算值', () => {
    const count = createSignal(1);
    const doubled = createComputed(() => count() * 2);
    expect(doubled()).toBe(2);
    count(5);
    expect(doubled()).toBe(10);
  });

  it('惰性求值 - 未读取时不执行', () => {
    const count = createSignal(0);
    const fn = vi.fn(() => count() * 2);
    const doubled = createComputed(fn);
    expect(fn).not.toHaveBeenCalled();
    doubled();
    expect(fn).toHaveBeenCalledTimes(1);
    doubled();
    expect(fn).toHaveBeenCalledTimes(1); // 缓存
  });

  it('依赖变化后再次读取时才重新计算', () => {
    const count = createSignal(0);
    const fn = vi.fn(() => count() * 2);
    const doubled = createComputed(fn);
    doubled();
    expect(fn).toHaveBeenCalledTimes(1);
    count(1);
    expect(fn).toHaveBeenCalledTimes(1); // 只标记 dirty
    doubled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('支持多个信号依赖', () => {
    const a = createSignal(2);
    const b = createSignal(3);
    const sum = createComputed(() => a() + b());
    expect(sum()).toBe(5);
    a(10);
    expect(sum()).toBe(13);
    b(20);
    expect(sum()).toBe(30);
  });

  it('计算属性可以链式依赖', () => {
    const base = createSignal(2);
    const doubled = createComputed(() => base() * 2);
    const quad = createComputed(() => doubled() * 2);
    expect(quad()).toBe(8);
    base(3);
    expect(quad()).toBe(12);
  });

  it('peek() 读取但不收集依赖', () => {
    const count = createSignal(5);
    const doubled = createComputed(() => count() * 2);
    expect(doubled.peek()).toBe(10);
  });
});

// ============================================================
//  3. createEffect
// ============================================================
describe('createEffect', () => {
  it('应立即执行一次', () => {
    const spy = vi.fn();
    createEffect(spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('依赖的信号变化时应重新执行', () => {
    const count = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { count(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    count(1);
    expect(spy).toHaveBeenCalledTimes(2);
    count(2);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('应自动追踪 computed 依赖', () => {
    const count = createSignal(0);
    const doubled = createComputed(() => count() * 2);
    const values = [];
    createEffect(() => { values.push(doubled()); });
    expect(values).toEqual([0]);
    count(3);
    expect(values).toEqual([0, 6]);
    count(5);
    expect(values).toEqual([0, 6, 10]);
  });

  it('dispose 后不再响应变化', () => {
    const count = createSignal(0);
    const spy = vi.fn();
    const dispose = createEffect(() => { count(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    dispose();
    count(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('重新执行前应调用清理函数', () => {
    const count = createSignal(0);
    const cleanupSpy = vi.fn();
    createEffect(() => { count(); return cleanupSpy; });
    expect(cleanupSpy).not.toHaveBeenCalled();
    count(1);
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    count(2);
    expect(cleanupSpy).toHaveBeenCalledTimes(2);
  });

  it('dispose 时应调用清理函数', () => {
    const cleanupSpy = vi.fn();
    const dispose = createEffect(() => cleanupSpy);
    expect(cleanupSpy).not.toHaveBeenCalled();
    dispose();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('条件依赖 - 依赖随分支动态变化', () => {
    const toggle = createSignal(true);
    const a = createSignal('A');
    const b = createSignal('B');
    const values = [];
    createEffect(() => { values.push(toggle() ? a() : b()); });
    expect(values).toEqual(['A']);

    a('A2');
    expect(values).toEqual(['A', 'A2']);

    b('B2'); // toggle=true, 不追踪 b
    expect(values).toEqual(['A', 'A2']);

    toggle(false);
    expect(values).toEqual(['A', 'A2', 'B2']);

    a('A3'); // toggle=false, 不追踪 a
    expect(values).toEqual(['A', 'A2', 'B2']);

    b('B3');
    expect(values).toEqual(['A', 'A2', 'B2', 'B3']);
  });

  it('多个 effect 追踪同一个信号', () => {
    const count = createSignal(0);
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    createEffect(() => { count(); spy1(); });
    createEffect(() => { count(); spy2(); });
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    count(1);
    expect(spy1).toHaveBeenCalledTimes(2);
    expect(spy2).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
//  4. batch
// ============================================================
describe('batch', () => {
  it('应将多次变更合并为一次 effect 执行', () => {
    const a = createSignal(0);
    const b = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { a(); b(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    batch(() => { a(1); b(2); });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('batch 内可以读取已更新的值', () => {
    const count = createSignal(0);
    let readValue;
    batch(() => { count(5); readValue = count.peek(); });
    expect(readValue).toBe(5);
  });

  it('嵌套 batch 在最外层结束时才触发', () => {
    const count = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { count(); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    batch(() => {
      count(1);
      batch(() => { count(2); });
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(count()).toBe(2);
  });

  it('batch 应返回回调的返回值', () => {
    expect(batch(() => 42)).toBe(42);
  });
});

// ============================================================
//  5. untrack
// ============================================================
describe('untrack', () => {
  it('untrack 内读取信号不收集依赖', () => {
    const a = createSignal(0);
    const b = createSignal(0);
    const spy = vi.fn();
    createEffect(() => { a(); untrack(() => b()); spy(); });
    expect(spy).toHaveBeenCalledTimes(1);
    b(1);
    expect(spy).toHaveBeenCalledTimes(1);
    a(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('untrack 应返回回调的返回值', () => {
    const count = createSignal(42);
    expect(untrack(() => count())).toBe(42);
  });
});

// ============================================================
//  6. signal() 在组件外使用
// ============================================================
describe('signal() 组件外', () => {
  it('组件外 signal() 等同 createSignal', () => {
    const count = signal(10);
    expect(count()).toBe(10);
    count(20);
    expect(count()).toBe(20);
    expect(count.peek()).toBe(20);
  });

  it('组件外 signal 可以被 effect 追踪', () => {
    const count = signal(0);
    const values = [];
    createEffect(() => { values.push(count()); });
    count(1);
    count(2);
    expect(values).toEqual([0, 1, 2]);
  });
});

// ============================================================
//  7. 综合场景
// ============================================================
describe('综合场景', () => {
  it('菱形依赖用 batch 处理', () => {
    const a = createSignal(1);
    const b = createComputed(() => a() * 2);
    const c = createComputed(() => a() * 3);
    const values = [];
    batch(() => {
      createEffect(() => { values.push(b() + c()); });
    });
    expect(values).toEqual([5]);
    batch(() => { a(2); });
    expect(values[values.length - 1]).toBe(10);
  });

  it('信号作为对象属性存储', () => {
    const store = { name: createSignal('Alice'), age: createSignal(25) };
    const descriptions = [];
    createEffect(() => { descriptions.push(`${store.name()}, ${store.age()}`); });
    expect(descriptions).toEqual(['Alice, 25']);
    store.name('Bob');
    expect(descriptions).toEqual(['Alice, 25', 'Bob, 25']);
    store.age(30);
    expect(descriptions).toEqual(['Alice, 25', 'Bob, 25', 'Bob, 30']);
  });

  it('computed 在 effect 中正确追踪', () => {
    const first = createSignal('张');
    const last = createSignal('三');
    const full = createComputed(() => `${first()} ${last()}`);
    const names = [];
    createEffect(() => { names.push(full()); });
    expect(names).toEqual(['张 三']);
    first('李');
    expect(names).toEqual(['张 三', '李 三']);
    last('四');
    expect(names).toEqual(['张 三', '李 三', '李 四']);
  });

  it('大量信号不应有性能问题', () => {
    const sigs = Array.from({ length: 100 }, (_, i) => createSignal(i));
    const sum = createComputed(() => sigs.reduce((acc, s) => acc + s(), 0));
    expect(sum()).toBe(4950);
    sigs[0](100);
    expect(sum()).toBe(5050);
  });

  it('effect 中可以设置其他信号', () => {
    const source = createSignal(1);
    const derived = createSignal(0);
    createEffect(() => { derived(source() * 10); });
    expect(derived()).toBe(10);
    source(2);
    expect(derived()).toBe(20);
  });

  it('dispose 清理链正确工作', () => {
    const count = createSignal(0);
    const doubled = createComputed(() => count() * 2);
    const spy = vi.fn();
    const dispose = createEffect(() => { spy(doubled()); });
    expect(spy).toHaveBeenLastCalledWith(0);
    count(5);
    expect(spy).toHaveBeenLastCalledWith(10);
    dispose();
    count(10);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
