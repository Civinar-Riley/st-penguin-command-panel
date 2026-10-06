# 本地验证台

不启动酒馆、不装酒馆助手，用桩函数冒充酒馆助手的接口，把命令面板跑起来并自检。
改完 `command_panel.js` 直接刷新页面即可，不用重新导入脚本包。

## 跑法

```bash
# 仓库根目录
python -m http.server 8791
```

- **单页模式**：打开 <http://127.0.0.1:8791/tests/_script_host.html>
  页面自己搭一套酒馆式骨架（顶栏 36px / 聊天列 / 底部输入框），脚本直接跑在本页。
- **iframe 模式**：打开 <http://127.0.0.1:8791/tests/_iframe_host.html>
  骨架由父页提供，脚本在 iframe 里执行、面板注入 `window.parent.document`——
  这是酒馆助手里的真实拓扑，用来抓「该用宿主 document 却写成 `document`」这类跨文档错误。
  两种模式下自检项相同，结果都会打印在页面右侧的验证台面板里。

页面加载后会自动跑一遍自检，也可以随时点「▶ 跑自检」重跑。

## 自检覆盖

**布局**（按当前视口自动切换窄屏 / 宽屏两组断言）

| 视口 | 断言 |
| :--- | :--- |
| ≤600px | 面板贴边全宽、点击目标 ≥40px、输入框字号 16px、格式化格 3 列、面板底部不压住输入区 |
| >600px | 面板 480px 宽贴右上、格式化格 4 列 |

两组都会检查：面板高度跟随 `--cmdp-vvh`、面板内无横向溢出。

**行为**

| 断言 | 期望 |
| :--- | :--- |
| 命令 / 格式化按钮数量 | 21 条命令、13 个格式化按钮 |
| 危险命令标记 | `/del`、`/cut` 带 `data-danger` |
| 无参命令 | `triggerSlash("/trigger")` |
| 带参命令 | `triggerSlash("/hide 3")` |
| 含空格参数 | 自动加引号：`triggerSlash("/echo \"hello world\"")` |
| `/sendas` | 走 `createChatMessages` 直写，不经命令行管道 |
| 危险命令 | 确认框拒绝 → 不执行；确认 → 带参数执行 |
| 文本格式化 | 结果写进 `#send_textarea`，且不触发发送 |
| 搜索筛选 | 筛后 1 条、清空还原 21 条 |
| 状态栏 | 显示版本号 |
| 脚本按钮 | 已注册到按钮栏 |

## 测移动端

浏览器 DevTools 把设备模拟调到 **412px 宽**（或直接把窗口缩到 412px）再刷新，
自检会自动切到窄屏断言组。想验软键盘遮挡，用真机或 DevTools 的设备模拟开软键盘。

## 复刻的结构

- 顶栏高 `--topBarBlockSize: 36px`，按钮栏 `#st-scriptbuttons` 即酒馆助手脚本按钮的位置
- 底部输入区 `#st-sendform` 高 110px，`#send_textarea` 是格式化输出的目标元素
- 聊天列 `#st-chat` 仅为观感，不参与断言

## 提示

- 酒馆助手接口桩（`triggerSlash` / `appendInexistentScriptButtons` / `getButtonEvent` / `eventOn` / `createChatMessages`）
  挂在**脚本所在 realm** 的 `window` 上，界面与日志则写进**宿主文档**，两者在 iframe 模式下不是同一个 document。
- 桩会把自己收到的每次调用打印到「接口调用记录」，对着日志看脚本实际发了什么命令最省事。
- 本页只是近似酒馆的真实环境，酒馆专属的其余 API 在页面里不存在；脚本对接口缺失已有 15 秒轮询与 `catch` 兜底。
- 这里不断言拖动：拖动依赖真实指针输入，用浏览器手动拖标题栏验证（WebView 兜底路径需把 `window.PointerEvent` 置空后重载脚本）。
