import {unit, share, signal, slot} from "./kra"

const Counter = unit((props) => {
    const count2 = want("count2"); // must be provided，如果不存在直接报错
    const count = want("count", () => single); // 如果不存在，返回single的默认值
  
    return () => (
      <div>
        <h3>基础计数器</h3>
        <p>计数: {count()}</p>
        <button onClick={() => count(count() + 1)}>+1</button>
        <button onClick={() => count(count() - 1)}>-1</button>
        <button onClick={() => count(0)}>重置</button>
      </div>
    );
  });


const child = unit(() => {

    const count = single(0)
    const count2 = single(0)

    // 第一 暴露一个object，所有key value会注入子元素
    share({
        count,
        count2
    })

    // 第二 2个参数
    const count3 = share("count", () => signal(0))


    // override("print_logic", () => {
    //     console.log(
    //         count()
    //     )
    // })

    return () => (
        <Counter />
    )
})


function App() {
    const [showTimer, setShowTimer] = React.useState(true);
  
    return (
      <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      </div>
    );
  }
  
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);