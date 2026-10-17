#!/usr/bin/env python3
"""یک لاگ صفحه نمونه در /tmp/page.log می‌سازد تا تب چشم را بدون سیستم واقعی تست کنید."""
import json
rows=[
 {"type":"page","url":"https://agentrouter.org/login","title":"ورود | AgentRouter","buttons":["ورود","ثبت‌نام"],"links":["فراموشی رمز"],"inputs":["email","password"],"errors":[],"text":"به AgentRouter خوش آمدید. ایمیل و رمز خود را وارد کنید."},
 {"type":"page","url":"https://agentrouter.org/dashboard","title":"داشبورد","buttons":["ساخت کلید جدید","خروج"],"links":["مدل‌ها","مصرف"],"inputs":[],"errors":["هشدار: موجودی کم است"],"text":"کلیدهای API شما"},
]
open("/tmp/page.log","w",encoding="utf-8").write("\n".join(json.dumps(r,ensure_ascii=False) for r in rows))
print("wrote /tmp/page.log")
