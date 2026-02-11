/**
 * kra使用示例 - SolidJS 风格
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  signal,
  createEffect,
  createSignal,
  createComputed,
  component,
  batch,
  untrack,
  onCleanup,
  share,
  want,
} from './kra';

// ============================================================
// 示例 1：基础计数器（直接返回 JSX）
// ============================================================
const Counter = component(function Counter() {
  const count = signal(0);

  return (
    <div>
      <h3>基础计数器</h3>
      <p>计数: {count()}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
      <button onClick={() => count(count() - 1)}>-1</button>
      <button onClick={() => count(0)}>重置</button>
    </div>
  );
});

// ============================================================
// 示例 2：计算属性 = 普通函数
// ============================================================
const PriceCalculator = component(function PriceCalculator() {
  console.log("setup")

  const price = signal(100);
  const quantity = signal(1);
  const discount = signal(0);

  const total = () => {
    const subtotal = price() * quantity();
    return subtotal * (1 - discount() / 100);
  };

  return () => (
    <div>
      <h3>价格计算器（计算属性 = 普通函数）</h3>
      <label>
        单价: <input type="number" value={price()} onChange={(e) => price(+e.target.value)} />
      </label>
      <label>
        数量: <input type="number" value={quantity()} onChange={(e) => quantity(+e.target.value)} />
      </label>
      <label>
        折扣(%): <input type="number" value={discount()} onChange={(e) => discount(+e.target.value)} />
      </label>
      <p>总价: ¥{total().toFixed(2)}</p>
    </div>
  );
});

// ============================================================
// 示例 3：自动副作用（返回渲染函数 - 推荐方式）
// ============================================================
const AutoLogger = component(function AutoLogger() {
  const name = signal('');
  const age = signal(0);
  const ext = signal('')

  // setup 中写 effect，只注册一次，组件卸载自动清理
  createEffect(() => {
    console.log("effected")
    if (name() && age()) {
      console.log(`[Effect] 用户信息更新: ${name()}, ${age()}岁`);
    }
  });

  // 返回渲染函数 — setup 逻辑（上面的 createEffect）真正只执行一次
  return () => (
    <div>
      <h3>自动副作用（打开控制台查看）</h3>
      <input placeholder="不该触发" value={ext()} onChange={(e) => ext(e.target.value)} />
      <input placeholder="姓名" value={name()} onChange={(e) => name(e.target.value)} />
      <input type="number" placeholder="年龄" value={age()} onChange={(e) => age(+e.target.value)} />
    </div>
  );
});

// ============================================================
// 示例 4：全局共享状态 - 不需要 observer！
// ============================================================
const globalCount = signal(0);
const globalDoubled = () => globalCount() * 2;

const DisplayA = component(function DisplayA() {
  return <p>组件A - 全局计数: {globalCount()}</p>;
});

const DisplayB = component(function DisplayB() {
  return <p>组件B - 双倍值: {globalDoubled()}</p>;
});

const GlobalControls = component(function GlobalControls() {
  return (
    <div>
      <h3>全局共享状态（无需 observer）</h3>
      <button onClick={() => globalCount(globalCount.peek() + 1)}>全局 +1</button>
      <button onClick={() => globalCount(0)}>重置</button>
      <DisplayA />
      <DisplayB />
    </div>
  );
});

// ============================================================
// 示例 5：批量更新 - batch
// ============================================================
const BatchExample = component(function BatchExample() {
  const firstName = signal('');
  const lastName = signal('');
  const fullName = () => `${firstName()} ${lastName()}`.trim();

  return (
    <div>
      <h3>批量更新</h3>
      <p>全名: {fullName() || '(未输入)'}</p>
      <button onClick={() => { firstName('张'); lastName('三'); }}>
        普通更新
      </button>
      <button onClick={() => { batch(() => { firstName('李'); lastName('四'); }); }}>
        批量更新
      </button>
    </div>
  );
});

// ============================================================
// 示例 6：函数式更新
// ============================================================
const FunctionalUpdate = component(function FunctionalUpdate() {
  const items = signal([]);

  return (
    <div>
      <h3>函数式更新</h3>
      <button onClick={() => items((prev) => [...prev, `项目 ${prev.length + 1}`])}>
        添加项目
      </button>
      <button onClick={() => items((prev) => prev.slice(0, -1))}>
        移除最后
      </button>
      <ul>
        {items().map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
});

// ============================================================
// 示例 7：定时器 + onCleanup（返回渲染函数 - 确保 setup 只执行一次）
// ============================================================
const TimerDemo = component(function TimerDemo() {
  const seconds = signal(0);
  const id = setInterval(() => seconds((s) => s + 1), 1000);
  onCleanup(() => clearInterval(id));

  // 返回渲染函数：setInterval 和 onCleanup 只在 setup 时执行一次
  return () => (
    <div>
      <h3>定时器（onCleanup 自动清理）</h3>
      <p>已运行: {seconds()} 秒</p>
    </div>
  );
});

// ============================================================
// 示例 8：独立响应式系统（脱离 React）
// ============================================================
function standaloneDemo() {
  console.log('--- 独立响应式系统演示 ---');
  const count = createSignal(0);
  const doubled = createComputed(() => count() * 2);
  const dispose = createEffect(() => {
    console.log(`count = ${count()}, doubled = ${doubled()}`);
  });
  count(1);
  count(5);
  dispose();
  count(100); // 无输出
}
standaloneDemo();

// ============================================================
// 示例 9：接收 props
// ============================================================
const Greeting = component(function Greeting(props) {
  const suffix = signal('!');

  return () => (
    <div>
      <p>你好, {props.name}{suffix()}</p>
      <button onClick={() => suffix((s) => s + '!')}>更多感叹号</button>
    </div>
  );
});

// ============================================================
// 示例 10：Context 注入（share / want）
// ============================================================

// 孙组件：直接 want(key) 获取祖辈 share 的值，无需经过中间组件传递
const ThemeLabel = component(function ThemeLabel() {
  const theme = want('theme');
  // theme 是一个 signal，读取即自动追踪
  return () => (
    <span style={{
      padding: '4px 12px',
      borderRadius: 4,
      background: theme() === 'dark' ? '#333' : '#eee',
      color: theme() === 'dark' ? '#fff' : '#333',
    }}>
      当前主题: {theme()}
    </span>
  );
});

const UserLabel = component(function UserLabel() {
  const user = want('user');
  return () => <span>当前用户: {user().name}</span>;
});

// 中间组件：不需要知道任何 context，直接渲染子组件
const MiddleLayer = component(function MiddleLayer() {
  return () => (
    <div style={{ padding: 8, border: '1px dashed #ccc', margin: '8px 0' }}>
      <p style={{ color: '#999', fontSize: 12 }}>中间层组件（不接收任何 context props）</p>
      <ThemeLabel />
      <br />
      <UserLabel />
    </div>
  );
});

// 顶层组件：share 数据
const ContextDemo = component(function ContextDemo() {
  const theme = signal('light');
  const user = signal({ name: '小明' });

  // 向后代注入（字符串 key，子组件通过同名 key want）
  share('theme', theme);
  share('user', user);

  return () => (
    <div>
      <h3>Context 注入（share / want）</h3>
      <button onClick={() => theme(t => t === 'light' ? 'dark' : 'light')}>
        切换主题
      </button>
      <button onClick={() => user(u => u.name === '小明' ? { name: '小红' } : { name: '小明' })}>
        切换用户
      </button>
      <MiddleLayer />
    </div>
  );
});

// ============================================================
// 主应用
// ============================================================
function App() {
  const [showTimer, setShowTimer] = React.useState(true);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>kra响应式系统演示</h1>
      <hr />
      <Counter />
      <hr />
      <PriceCalculator />
      <hr />
      <AutoLogger />
      <hr />
      <GlobalControls />
      <hr />
      <BatchExample />
      <hr />
      <FunctionalUpdate />
      <hr />
      <button onClick={() => setShowTimer(!showTimer)}>
        {showTimer ? '卸载定时器' : '挂载定时器'}
      </button>
      {showTimer && <TimerDemo />}
      <hr />
      <Greeting name="SuperState" />
      <hr />
      <ContextDemo />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
