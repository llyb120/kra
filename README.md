# FuckReact

signal 当状态用，读是函数调用，写也是函数调用。组件用 `component()` 包一下，状态变了自动更新，不需要 `useState`、不需要 `useMemo`、不需要依赖数组。

## 安装

把 `fuckreact.js` 丢进项目，直接 import 就行：

```js
import { signal, component, createEffect } from './superstate';
```

## 核心概念

### signal — 响应式状态

一个 signal 就是一个函数。不传参就是读，传参就是写：

```jsx
const count = signal(0);

count()        // 读 → 0
count(5)       // 写 → 设为 5
count(c => c+1) // 写 → 函数式更新
```

存什么都行，数字、字符串、对象、数组：

```jsx
const user = signal({ name: '小明', age: 20 });
const list = signal([1, 2, 3]);

user({ name: '小红', age: 18 });
list(prev => [...prev, 4]);
```

想读值但不想触发追踪（比如在事件处理里），用 `.peek()`：

```jsx
count.peek()  // 读取值，不建立追踪关系
```

### component — 定义组件

用 `component()` 包住一个函数就是一个组件。有两种写法：

**写法一：返回渲染函数（推荐）**

外层是 setup，只跑一次。返回的箭头函数是渲染逻辑，状态变了会重新执行：

```jsx
const Counter = component(function Counter() {
  // ---- setup 区域，只执行一次 ----
  const count = signal(0);
  console.log('我只打印一次');

  // ---- 返回渲染函数 ----
  return () => (
    <div>
      <p>{count()}</p>
      <button onClick={() => count(c => c + 1)}>+1</button>
    </div>
  );
});
```

**写法二：直接返回 JSX（更简洁）**

适合简单组件，不用多包一层函数：

```jsx
const Counter = component(function Counter() {
  const count = signal(0);
  return (
    <div>
      <p>{count()}</p>
      <button onClick={() => count(c => c + 1)}>+1</button>
    </div>
  );
});
```

两种写法效果一样，区别在于写法一的 setup 区域**确保**只执行一次，适合需要注册副作用、定时器等场景。写法二更随意一些，框架帮你处理复用。

### createEffect — 副作用

读了哪些 signal，那些 signal 变的时候就自动重跑。不用手写依赖数组：

```jsx
const Counter = component(function Counter() {
  const count = signal(0);

  createEffect(() => {
    console.log('count 变了:', count());
    // 这里只追踪了 count，其他 signal 变不会触发
  });

  return () => <button onClick={() => count(c => c + 1)}>+1</button>;
});
```

effect 的返回值会被当作清理函数，下次重跑前自动调用：

```jsx
createEffect(() => {
  const handler = () => console.log('resize');
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
});
```

组件卸载时，里面的所有 effect 自动清理，不用操心。

### 计算属性 — 就是普通函数

不需要什么特殊 API，写个函数就完了：

```jsx
const price = signal(100);
const quantity = signal(3);

const total = () => price() * quantity();
// total() → 300，price 或 quantity 变了，读 total() 就是新值
```

如果计算开销大，可以用 `createComputed` 做缓存，依赖没变不会重算：

```jsx
const expensiveResult = createComputed(() => {
  return heavyCalculation(price(), quantity());
});
```

## 进阶用法

### 全局状态

signal 定义在组件外面，就是全局的。哪个组件读了它，它变的时候哪个组件就更新。不需要 Context、不需要 Provider、不需要 observer：

```jsx
// 在模块顶层定义
const theme = signal('light');

const Header = component(function Header() {
  return () => <h1 style={{ color: theme() === 'dark' ? '#fff' : '#000' }}>标题</h1>;
});

const Toggle = component(function Toggle() {
  return () => (
    <button onClick={() => theme(t => t === 'light' ? 'dark' : 'light')}>
      切换主题
    </button>
  );
});
```

### batch — 批量更新

同时改多个 signal，想只触发一次更新：

```jsx
batch(() => {
  firstName('李');
  lastName('四');
});
// 组件只更新一次，而不是两次
```

### untrack — 不追踪

读 signal 但不想建立依赖关系：

```jsx
createEffect(() => {
  // name 变了会重跑
  console.log(name());
  // age 变了不会重跑
  console.log(untrack(() => age()));
});
```

### onCleanup — 注册清理回调

组件卸载时要做的事情：

```jsx
const Timer = component(function Timer() {
  const seconds = signal(0);

  const id = setInterval(() => seconds(s => s + 1), 1000);
  onCleanup(() => clearInterval(id));

  return () => <p>已运行 {seconds()} 秒</p>;
});
```

### provide / want — 跨层级传值

父组件 `provide`，后代组件 `want` 获取，中间层不用管：

```jsx
const Parent = component(function Parent() {
  const theme = signal('dark');
  provide('theme', theme);

  return () => <Child />;
});

const Child = component(function Child() {
  // 中间层，什么都不用做
  return () => <GrandChild />;
});

const GrandChild = component(function GrandChild() {
  const theme = want('theme');
  return () => <p>主题: {theme()}</p>;
});
```

## 接收 Props

props 就是普通对象，直接在渲染函数里读：

```jsx
const Greeting = component(function Greeting(props) {
  const suffix = signal('!');

  return () => (
    <p>
      你好, {props.name}{suffix()}
      <button onClick={() => suffix(s => s + '!')}>!</button>
    </p>
  );
});

// 使用
<Greeting name="世界" />
```

## 脱离 React 使用

响应式系统本身不依赖 React。用 `createSignal`、`createComputed`、`createEffect` 在任何地方都能跑：

```js
import { createSignal, createComputed, createEffect } from './superstate';

const count = createSignal(0);
const doubled = createComputed(() => count() * 2);

const dispose = createEffect(() => {
  console.log(`count=${count()}, doubled=${doubled()}`);
});

count(1);  // 打印: count=1, doubled=2
count(5);  // 打印: count=5, doubled=10
dispose(); // 停止监听
count(99); // 不会打印了
```

> 注意：组件里用 `signal()`，组件外用 `createSignal()`。前者在组件内有索引复用机制，后者是纯粹的创建。

## API 一览

| API | 说明 |
|-----|------|
| `signal(value)` | 创建响应式状态（组件内用） |
| `createSignal(value)` | 创建响应式状态（通用） |
| `createComputed(fn)` | 创建带缓存的计算值 |
| `createEffect(fn)` | 创建自动追踪的副作用 |
| `component(fn)` | 把函数包装成 React 组件 |
| `batch(fn)` | 批量更新，合并触发 |
| `untrack(fn)` | 执行 fn 但不追踪依赖 |
| `onCleanup(fn)` | 注册组件卸载时的清理回调 |
| `provide(key, value)` | 向后代组件注入值 |
| `want(key, fallback?)` | 获取祖辈 provide 的值 |

## 启动演示

```bash
npm install
npm run dev
```

浏览器打开 Vite 给的地址就能看到效果。
