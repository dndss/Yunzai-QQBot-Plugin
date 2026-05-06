// 不再静态导入 config 和 adapter，改为通过构造函数接收
export class QQBotAdmin extends plugin {
  constructor(config, configSave, adapter) {
    super({
      name: "QQBotAdapter",
      dsc: "QQBot 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#[Qq]+[Bb]ot账号$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#[Qq]+[Bb]ot设置[0-9]+:[0-9]+:.+:.+:([01]:[01]|2)$",
          fnc: "Token",
          permission: config.permission,
        },
        {
          reg: "^#[Qq]+[Bb]ot绑定用户.+$",
          fnc: "BindUser",
        },
      ],
    })

    this._config = config
    this._configSave = configSave
    this._adapter = adapter
  }

  List() {
    this.reply(`共${this._config.token.length}个账号：\n${this._config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#[Qq]+[Bb]ot设置/, "").trim()
    if (this._config.token.includes(token)) {
      this._config.token = this._config.token.filter(item => item !== token)
      this.reply(`账号已删除，重启后生效，共${this._config.token.length}个账号`, true)
    } else {
      if (await this._adapter.connect(token)) {
        this._config.token.push(token)
        this.reply(`账号已连接，共${this._config.token.length}个账号`, true)
      } else {
        this.reply(`账号连接失败`, true)
        return false
      }
    }
    await this._configSave()
  }

  BindUser() {
    const id = this.e.msg.replace(/^#[Qq]+[Bb]ot绑定用户(确认)?/, "").trim()
    if (id === this.e.user_id) return this.reply("请切换到对应Bot")

    this._adapter.bind_user[this.e.user_id] = id
    this.reply([
      `绑定 ${id} → ${this.e.user_id}`,
      segment.button([
        {
          text: "确认绑定",
          callback: `#QQBot绑定用户确认${this.e.user_id}`,
          permission: this.e.user_id,
        },
      ]),
    ])
  }
}
