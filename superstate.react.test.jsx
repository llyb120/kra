/**
 * kraReact 集成测试
 *
 * unit() 只支持 setup + render 模式：return () => JSX
 * 直接返回 JSX 会抛出错误。
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import {
  signal,
  createSignal,
  createComputed,
  createEffect,
  unit,
  batch,
  onCleanup,
} from './kra.js';

afterEach(cleanup);

// ============================================================
//  setup + render 模式：return () => JSX
// ============================================================
describe('setup + render: return () => JSX', () => {
  it('应渲染初始值', () => {
    const App = unit(function App() {
      const count = signal(42);
      return () => <div data-testid="value">{count()}</div>;
    });
    render(<App />);
    expect(screen.getByTestId('value').textContent).toBe('42');
  });

  it('信号变化时更新渲染', async () => {
    const App = unit(function App() {
      const count = signal(0);
      return () => (
        <div>
          <span data-testid="count">{count()}</span>
          <button data-testid="inc" onClick={() => count(count() + 1)}>+</button>
        </div>
      );
    });
    render(<App />);
    expect(screen.getByTestId('count').textContent).toBe('0');

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(screen.getByTestId('count').textContent).toBe('1');

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('setup 只执行一次', async () => {
    const setupSpy = vi.fn();
    const App = unit(function App() {
      const count = signal(0);
      setupSpy(); // 应只调用一次
      return () => (
        <div>
          <span data-testid="count">{count()}</span>
          <button data-testid="inc" onClick={() => count(count() + 1)}>+</button>
        </div>
      );
    });
    render(<App />);
    expect(setupSpy).toHaveBeenCalledTimes(1);

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(setupSpy).toHaveBeenCalledTimes(1); // 仍然只调用一次
  });

  it('createEffect 在 setup 中注册，信号变化时执行', async () => {
    const spy = vi.fn();
    const App = unit(function App() {
      const count = signal(0);
      createEffect(() => { spy(count()); });
      return () => (
        <button data-testid="inc" onClick={() => count(count() + 1)}>+</button>
      );
    });
    render(<App />);
    expect(spy).toHaveBeenCalledWith(0);

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(spy).toHaveBeenCalledWith(1);

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('onCleanup 在组件卸载时调用', async () => {
    const cleanupSpy = vi.fn();
    const Child = unit(function Child() {
      onCleanup(cleanupSpy);
      return () => <div>child</div>;
    });

    function App() {
      const [show, setShow] = React.useState(true);
      return (
        <div>
          {show && <Child />}
          <button data-testid="toggle" onClick={() => setShow((s) => !s)}>toggle</button>
        </div>
      );
    }
    render(<App />);
    expect(cleanupSpy).not.toHaveBeenCalled();

    await act(() => { fireEvent.click(screen.getByTestId('toggle')); });
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('setInterval + onCleanup 不会指数增长', async () => {
    let intervalCount = 0;
    const origSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => { intervalCount++; return origSetInterval(...args); };

    const Timer = unit(function Timer() {
      const count = signal(0);
      const id = setInterval(() => count((c) => c + 1), 100);
      onCleanup(() => clearInterval(id));
      return () => <span data-testid="count">{count()}</span>;
    });

    function App() {
      const [show, setShow] = React.useState(true);
      return (
        <div>
          {show && <Timer />}
          <button data-testid="toggle" onClick={() => setShow((s) => !s)}>toggle</button>
        </div>
      );
    }

    render(<App />);
    expect(intervalCount).toBe(1); // 只创建一次

    // 等待几个 tick，让 count 增长
    await act(() => new Promise((r) => setTimeout(r, 350)));
    const val = parseInt(screen.getByTestId('count').textContent);
    expect(val).toBeGreaterThanOrEqual(2);
    expect(intervalCount).toBe(1); // 仍然只有一个 interval

    // 卸载：应清除 interval
    await act(() => { fireEvent.click(screen.getByTestId('toggle')); });

    globalThis.setInterval = origSetInterval;
  });

  it('接收 props', () => {
    const Greet = unit(function Greet(props) {
      return () => <div data-testid="msg">Hello, {props.name}!</div>;
    });
    render(<Greet name="World" />);
    expect(screen.getByTestId('msg').textContent).toBe('Hello, World!');
  });

  it('计算属性（普通函数）自动追踪', async () => {
    const App = unit(function App() {
      const count = signal(5);
      const doubled = () => count() * 2;
      return () => (
        <div>
          <span data-testid="d">{doubled()}</span>
          <button data-testid="inc" onClick={() => count(count() + 1)}>+</button>
        </div>
      );
    });
    render(<App />);
    expect(screen.getByTestId('d').textContent).toBe('10');

    await act(() => { fireEvent.click(screen.getByTestId('inc')); });
    expect(screen.getByTestId('d').textContent).toBe('12');
  });
});

// ============================================================
//  直接返回 JSX 应报错
// ============================================================
describe('直接返回 JSX 应报错', () => {
  it('setup 返回非函数值时应抛出错误', () => {
    const App = unit(function App() {
      const count = signal(42);
      return <div>{count()}</div>;
    });
    expect(() => {
      render(<App />);
    }).toThrow('[kra]');
  });

  it('错误信息应包含函数名', () => {
    const MyComp = unit(function MyComp() {
      return <div>hello</div>;
    });
    expect(() => {
      render(<MyComp />);
    }).toThrow('MyComp');
  });

  it('匿名函数也应报错', () => {
    const App = unit(() => {
      return <div>hello</div>;
    });
    expect(() => {
      render(<App />);
    }).toThrow('anonymous');
  });
});

// ============================================================
//  全局信号
// ============================================================
describe('全局信号', () => {
  it('unit 自动追踪全局信号', async () => {
    const g = createSignal('hello');
    const App = unit(function App() {
      return () => <div data-testid="g">{g()}</div>;
    });
    render(<App />);
    expect(screen.getByTestId('g').textContent).toBe('hello');

    await act(() => { g('world'); });
    expect(screen.getByTestId('g').textContent).toBe('world');
  });

  it('多个 unit 共享全局信号', async () => {
    const theme = createSignal('light');
    const A = unit(function A() {
      return () => <span data-testid="a">{theme()}</span>;
    });
    const B = unit(function B() {
      return () => <span data-testid="b">{theme()}</span>;
    });

    function App() {
      return (
        <div>
          <A /><B />
          <button data-testid="t" onClick={() => theme(theme.peek() === 'light' ? 'dark' : 'light')}>t</button>
        </div>
      );
    }
    render(<App />);
    expect(screen.getByTestId('a').textContent).toBe('light');
    expect(screen.getByTestId('b').textContent).toBe('light');

    await act(() => { fireEvent.click(screen.getByTestId('t')); });
    expect(screen.getByTestId('a').textContent).toBe('dark');
    expect(screen.getByTestId('b').textContent).toBe('dark');
  });
});

// ============================================================
//  batch + unit
// ============================================================
describe('batch + unit', () => {
  it('batch 内多次变更合并渲染', async () => {
    const App = unit(function App() {
      const a = signal('');
      const b = signal('');
      return () => (
        <div>
          <span data-testid="val">{a()} {b()}</span>
          <button data-testid="go"
            onClick={() => { batch(() => { a('hello'); b('world'); }); }}
          >go</button>
        </div>
      );
    });
    render(<App />);

    await act(() => { fireEvent.click(screen.getByTestId('go')); });
    expect(screen.getByTestId('val').textContent).toBe('hello world');
  });
});
