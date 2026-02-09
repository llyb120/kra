/**
 * FuckReact使用示例
 * 展示响应式系统的各种用法
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  createSignal,
  createComputed,
  createEffect,
  useSuperState,
  useComputed,
  useAutoEffect,
  observer,
  batch,
  untrack,
} from './fuckreact';

// ============================================================
// 示例 1：基础用法 - useSuperState
// ============================================================
function Counter() {
  const count = useSuperState(0);

  return (
    <div>
      <h3>基础计数器</h3>
      <p>计数: {count()}</p>
      <button onClick={() => count(count() + 1)}>+1</button>
      <button onClick={() => count(count() - 1)}>-1</button>
      <button onClick={() => count(0)}>重置</button>
    </div>
  );
}

// ============================================================
// 示例 2：计算属性 - useComputed (自动依赖收集)
// ============================================================
function PriceCalculator() {
  const price = useSuperState(100);
  const quantity = useSuperState(1);
  const discount = useSuperState(0);

  // useComputed 自动追踪 price、quantity、discount 的依赖
  // 任何一个变化都会自动重新计算，无需手动声明依赖
  const total = useComputed(() => {
    const subtotal = price() * quantity();
    return subtotal * (1 - discount() / 100);
  });

  return (
    <div>
      <h3>价格计算器 (自动依赖收集)</h3>
      <label>
        单价: <input type="number" value={price()} onChange={(e) => price(+e.target.value)} />
      </label>
      <label>
        数量: <input type="number" value={quantity()} onChange={(e) => quantity(+e.target.value)} />
      </label>
      <label>
        折扣(%): <input type="number" value={discount()} onChange={(e) => discount(+e.target.value)} />
      </label>
      <p>总价: ¥{total.toFixed(2)}</p>
    </div>
  );
}

// ============================================================
// 示例 3：自动副作用 - useAutoEffect
// ============================================================
function AutoLogger() {
  const name = useSuperState('');
  const age = useSuperState(0);

  // 自动追踪依赖：name 或 age 变化时自动执行
  // 无需像 React useEffect 那样手动写依赖数组
  useAutoEffect(() => {
    if (name() && age()) {
      console.log(`[AutoEffect] 用户信息更新: ${name()}, ${age()}岁`);
    }
  });

  return (
    <div>
      <h3>自动副作用 (打开控制台查看)</h3>
      <input placeholder="姓名" value={name()} onChange={(e) => name(e.target.value)} />
      <input type="number" placeholder="年龄" value={age()} onChange={(e) => age(+e.target.value)} />
    </div>
  );
}

// ============================================================
// 示例 4：全局共享状态 + observer
// ============================================================

// 在组件外部创建全局信号
const globalCount = createSignal(0);
const globalDoubled = createComputed(() => globalCount() * 2);

// 使用 observer 包裹组件，自动追踪组件内读取的全局信号
const DisplayA = observer(function DisplayA() {
  return <p>组件A - 全局计数: {globalCount()}</p>;
});

const DisplayB = observer(function DisplayB() {
  return <p>组件B - 双倍值: {globalDoubled()}</p>;
});

// 这个组件只修改不读取，所以不需要 observer
function GlobalControls() {
  return (
    <div>
      <h3>全局共享状态 (observer)</h3>
      <button onClick={() => globalCount(globalCount.peek() + 1)}>全局 +1</button>
      <button onClick={() => globalCount(0)}>重置</button>
      <DisplayA />
      <DisplayB />
    </div>
  );
}

// ============================================================
// 示例 5：批量更新 - batch
// ============================================================
function BatchExample() {
  const firstName = useSuperState('');
  const lastName = useSuperState('');
  const renderCount = useSuperState(0);

  const fullName = useComputed(() => {
    renderCount(renderCount.peek() + 1); // 每次计算时递增
    return `${firstName()} ${lastName()}`.trim();
  });

  return (
    <div>
      <h3>批量更新</h3>
      <p>全名: {fullName || '(未输入)'}</p>
      <p>计算次数: {renderCount()}</p>
      <button
        onClick={() => {
          // 不使用 batch：firstName 和 lastName 各触发一次更新
          firstName('张');
          lastName('三');
        }}
      >
        普通更新 (触发2次计算)
      </button>
      <button
        onClick={() => {
          // 使用 batch：合并为一次更新
          batch(() => {
            firstName('李');
            lastName('四');
          });
        }}
      >
        批量更新 (只触发1次计算)
      </button>
    </div>
  );
}

// ============================================================
// 示例 6：函数式更新 + peek
// ============================================================
function FunctionalUpdate() {
  const items = useSuperState([]);

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
}

// ============================================================
// 示例 7：独立的响应式系统（脱离 React 使用）
// ============================================================
function standaloneDemo() {
  console.log('--- 独立响应式系统演示 ---');

  const count = createSignal(0);
  const doubled = createComputed(() => count() * 2);

  // 创建副作用 - 自动追踪 count 和 doubled
  const dispose = createEffect(() => {
    console.log(`count = ${count()}, doubled = ${doubled()}`);
  });
  // 输出: count = 0, doubled = 0

  count(1);
  // 输出: count = 1, doubled = 2

  count(5);
  // 输出: count = 5, doubled = 10

  dispose(); // 停止追踪

  count(100); // 不再输出，因为 effect 已销毁
}

// 运行独立演示
standaloneDemo();

// ============================================================
// 主应用
// ============================================================
function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>FuckReact响应式系统演示</h1>
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
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
