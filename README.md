# Kra - Kick React's Ass

- 基于细粒度响应式的 React 状态管理库。
- 使用 Signal 作为状态原语，通过自动依赖追踪实现按需更新，无需手动管理依赖数组。
- 将开发流程还原为观察者模式，无需担心hook引入的心智负担

## 特性

- **细粒度更新**：状态变化直接触发依赖该状态的组件重新渲染
- **自动依赖追踪**：无需手动声明依赖数组
- **零学习成本**：API 简洁直观，与 React 生态无缝集成
- **轻量级**：核心代码不足 300 行

## 安装

或直接引入源文件：

```js
import { signal, unit, createEffect } from './kra.js';
```

## 快速开始

```jsx
import { signal, unit } from 'kra';

const Counter = unit(() => {
  const count = signal(0);

  return () => (
    <div>
      <span>Count: {count()}</span>
      <button onClick={() => count(c => c + 1)}>Increment</button>
    </div>
  );
});
```

## 核心概念

### Signal

Signal 是响应式状态的基本单位，以函数形式暴露读写接口：

```ts
const count = signal(0);

// 读取
count(); // → 0

// 写入
count(5);

// 函数式更新
count(c => c + 1);
```

支持任意数据类型：

```ts
const user = signal({ name: 'Alice', age: 25 });
const items = signal([1, 2, 3]);

user({ name: 'Bob', age: 30 });
items(prev => [...prev, 4]);
```

和react的useState唯一区别：永远使用函数（不论是read还是write）

#### 非追踪读取

使用 `.peek()` 可在不建立依赖关系的情况下读取值：

```ts
count.peek(); // 读取值但不建立追踪
```

### Unit

`unit()` 函数将普通函数转换为 React 组件，提供响应式状态管理能力。

#### Setup + Render 模式（推荐）

```jsx
const Counter = unit(() => {
  // Setup 阶段：仅执行一次
  const count = signal(0);

  createEffect(() => {
    console.log('Count changed:', count());
  });

  // 返回 Render 函数：状态变化时重新执行
  return () => (
    <button onClick={() => count(c => c + 1)}>
      {count()}
    </button>
  );
});
```

#### 简化模式

```jsx
const Counter = unit(() => {
  const count = signal(0);
  return <button onClick={() => count(c => c + 1)}>{count()}</button>;
});
```

### Effect

`createEffect` 创建自动追踪依赖的副作用：

```jsx
const UserProfile = unit(() => {
  const userId = signal(1);
  const userData = signal(null);

  createEffect(() => {
    // 当 userId 变化时自动重新执行
    fetch(`/api/users/${userId()}`)
      .then(res => res.json())
      .then(data => userData(data));
  });

  return () => <div>{userData()?.name}</div>;
});
```

Effect 返回的函数会在下次执行前或组件卸载时自动调用：

```js
createEffect(() => {
  const handler = () => console.log('resize');
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
});
```

### 计算属性

计算属性无需特殊 API，普通函数即可：

```jsx
const price = signal(100);
const quantity = signal(3);

const total = () => price() * quantity();
```

对于昂贵计算，使用 `createComputed` 进行缓存：

```jsx
const result = createComputed(() => {
  return heavyCalculation(price(), quantity());
});
```

## 高级用法

### 全局状态

在模块作用域定义 Signal 即可创建全局状态，无需 Context 或 Provider：

```jsx
// store.ts
export const theme = signal('light');

// components/Header.jsx
export const Header = unit(() => {
  return () => <h1 style={{ color: theme() === 'dark' ? '#fff' : '#000' }}>Header</h1>;
});

// components/Toggle.jsx
export const Toggle = unit(() => {
  return () => (
    <button onClick={() => theme(t => t === 'light' ? 'dark' : 'light')}>
      Toggle Theme
    </button>
  );
});
```

### 批量更新

使用 `batch` 合并多次状态更新为单次渲染：

```jsx
import { batch } from 'kra';

const updateProfile = () => {
  batch(() => {
    firstName('John');
    lastName('Doe');
    age(30);
  });
  // 仅触发一次重新渲染
};
```

### 接口 / 实现

使用 `share` 和 `want` 实现跨层级数据传递：

数据流动方向永远是 祖辈 -> 孙辈

```jsx
const Parent = unit(() => {
  const config = signal({ theme: 'dark' });
  share('config', config);

  return () => <Child />;
});

const GrandChild = unit(() => {
  const config = want('config');
  return () => <div>Theme: {config().theme}</div>;
});
```

### 生命周期清理

使用 `onCleanup` 注册组件卸载时的清理逻辑：

```jsx
const Timer = unit(() => {
  const seconds = signal(0);
  const timerId = setInterval(() => seconds(s => s + 1), 1000);

  onCleanup(() => clearInterval(timerId));

  return () => <div>{seconds()}</div>;
});
```

## Props 处理

Props 作为普通参数传递，在渲染函数中使用：

```jsx
const Button = unit(props => {
  const count = signal(0);

  return () => (
    <button onClick={() => count(c => c + 1)}>
      {props.label}: {count()}
    </button>
  );
});

// 使用
<Button label="Click me" />
```

## 独立使用响应式系统

核心响应式系统可脱离 React 独立使用：

```js
import { createSignal, createComputed, createEffect } from 'kra';

const count = createSignal(0);
const doubled = createComputed(() => count() * 2);

const dispose = createEffect(() => {
  console.log(`count=${count()}, doubled=${doubled()}`);
});

count(1);  // → count=1, doubled=2
count(5);  // → count=5, doubled=10

dispose(); // 停止监听
count(99); // 无输出
```

**注意**：组件内使用 `signal()`，组件外使用 `createSignal()`。

## API 参考

| API | 描述 |
|-----|------|
| `signal(value)` | 创建响应式状态（组件内） |
| `createSignal(value)` | 创建响应式状态（通用） |
| `createComputed(fn)` | 创建带缓存的计算值 |
| `createEffect(fn)` | 创建自动追踪的副作用 |
| `unit(fn)` | 将函数包装为响应式组件 |
| `batch(fn)` | 批量更新，合并渲染 |
| `untrack(fn)` | 执行函数但不追踪依赖 |
| `onCleanup(fn)` | 注册组件卸载时的清理回调 |
| `share(key, value)` | 向后代组件注入值 |
| `want(key, fallback?)` | 获取祖辈注入的值 |

## License

MIT
