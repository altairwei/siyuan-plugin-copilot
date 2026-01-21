<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118224558-e1kdo6x.png" />

插件GitHub地址：[https://github.com/Achuan-2/siyuan-plugin-copilot](https://github.com/Achuan-2/siyuan-plugin-copilot)

## 📝开发背景

思源笔记自带的AI功能比较弱，我经常需要向AI咨询各种问题，每次需要用AI根据我的笔记内容做出解答，总是要复制粘贴到其他AI软件，并且一个AI的回答往往不能令我满意，所以我经常会把同一个问题复制粘贴去询问不同AI模型，非常麻烦。

于是我自己在思源笔记里开发了一个AI插件

- 支持直接拖动笔记内容询问AI，还支持多模型同时问答功能，省去繁琐的复制粘贴操作。
- 支持保存不同预设，针对不同场景（写论文、写博客、写代码）切换模型和prompt
- 支持edit模式和agent模式，支持让AI对笔记内容进行查询和修改

## 📝更新日志

见[CHANGELOG.md](https://cdn.jsdelivr.net/gh/Achuan-2/siyuan-plugin-copilot@main/CHANGELOG.md)

## ✨主要功能介绍

### AI模型添加

多平台AI支持

- 插件内置常见平台（OpenAI、Google Gemini、DeepSeek、火山引擎）
- 也支持添加任意兼容 OpenAI API 的平台，灵活切换聊天模型

模型设置

- 支持独立配置每个模型的参数（温度、最大 tokens）
- 标识模型特殊能力（思考模式、视觉支持）

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118224932-h84zc74.png" />

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118225029-2f5k1mt.png" />

> 我自己主要用GPT5、Gemini 3.0、Claude 4.5 sonnet比较多，我使用的是[V3 API中转站](https://api.gpt.ge/register?aff=fQIZ)，按量付费，各个AI模型都能使用，比用官方的API能省不少钱，使用我的[邀请链接](https://api.gpt.ge/register?aff=fQIZ)注册可以获得$0.3余额奖励试用。

### 多模态支持

- 思源笔记内容：可通过拖拽块、拖拽页签、拖拽文档树的文档实现笔记内容一键发送给AI。拖动标题有特殊优化，是把标题下的所有内容发送给AI
- 图片上传：支持粘贴、上传图片，还支持拖动图片块直接上传
- 文件上传（支持 Markdown、文本文件等）

### 三种聊天模式切换：ask、edit、agent三种聊天模式切换

- ask 模式：日常问答，支持选择多个模型同时回复，选择满意回答

  直接拖拽笔记内容进行多模型问答

  <img alt="拖拽标题询问" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/拖拽标题询问-20260118231116-9olhf3h.gif" />

  多模型回答结果

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118231241-74cd19k.png" />
- edit 模式：编辑修改笔记，支持编辑查看差异、撤回

  比如我让AI把表格的某一列批量设置为红色字体

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118231401-xvkxsz2.png" />
- agent 模式：提供工具，让AI实现自助查询笔记内容、编辑笔记、创建文档等功能

  agent模式可以选择AI可以使用的工具

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118231449-4pdqcll.png" style="width: 498px;" />

  比如之前在[用Kimi K2 Thinking写了一个钙成像配准软件](https://mp.weixin.qq.com/s/R8GBAdzL5p3QnTVfud_GtQ)，就用这个插件，帮我这里整合关于钙成像配准的零散笔记，成功写一个python钙成像配准模块出来

  <img alt="PixPin_2025-11-08_19-45-58" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/PixPin_2025-11-08_19-45-58-20251108194601-4mks3of.png" style="width: 388px;" />

### 会话管理

- 支持保存对话历史，支持对历史记录进行置顶和删除
- 支持复制对话为Markdown
- 支持保存对话为文档

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118231854-tf2zh9n.png" />

### 预设管理

- 预设支持

  - 设置上下文消息数
  - Temperature
  - 临时系统提示词
  - 指定聊天模式
  - 选择特点模型

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118232101-zf7zy42.png" />
- 支持保存预设，快速切换预设

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118232042-1g4kam2.png" style="width: 396px;" />

  <img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118232314-3qj0h1p.png" style="width: 366px;" />

### 提示词管理

支持把常用提示词进行保存

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118232429-ymzcjdg.png" />

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/image-20260118232510-3e5duhz.png" />

## **注意事项**

使用本插件需要自备 AI 平台的 API 密钥，插件本身不提供 AI 服务。请遵守各平台的使用条款和隐私政策。

> 如果有需要使用GPT、Gemini、Claude等国外顶级模型的朋友，推荐[V3 API网站](https://api.gpt.ge/register?aff=fQIZ)，非常好用，按量付费，各个AI模型都能使用，比用官方的API能省不少钱，使用我的[邀请链接](https://api.gpt.ge/register?aff=fQIZ)注册可以获得$0.3余额奖励试用。

## 🔧 开发相关

如何打包插件

```bash
pnpm install
pnpm run dev
```

## 📄 许可证

GPL3 License

## 🙏 致谢

- 基于 [plugin-sample-vite-svelte](https://github.com/siyuan-note/plugin-sample-vite-svelte/) 模板开发
- 参考了 [sy-f-misc](https://github.com/frostime/sy-f-misc)的GPT对话功能实现

## ❤️项目贡献者

<a href="https://github.com/Achuan-2/siyuan-plugin-copilot/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Achuan-2/siyuan-plugin-copilot" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## ❤️用爱发电

如果喜欢我的插件，欢迎给GitHub仓库点star和微信赞赏，这会激励我继续完善此插件和开发新插件。

维护插件费时费力，个人时间和精力有限，开源只是分享，不等于我要浪费我的时间免费帮用户实现ta需要的功能，

我需要的功能我会慢慢改进（打赏可以催更），有些我觉得可以改进、但是现阶段不必要的功能需要打赏才改进（会标注打赏标签和需要打赏金额），而不需要的功能、实现很麻烦的功能会直接关闭issue不考虑实现

累积赞赏50元的朋友如果想加我微信和进粉丝交流群，可以在赞赏的时候备注微信号，或者发邮件到achuan-2@outlook.com来进行好友申请

<img alt="image" src="https://assets.b3logfile.com/siyuan/1610205759005/assets/network-asset-image-20250614123558-fuhir5v.png" />
