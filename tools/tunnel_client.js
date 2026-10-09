#!/usr/bin/env node
/**
 * 🌐 Android Termux Native Tunnel Client (Zero openurl bug)
 */
import http from 'node:http';
import https from 'node:https';

const port = process.argv[2] || 8787;

console.log(`====================================================================`);
console.log(`  🌐 در حال ساخت تونل اینترنتی اختصاصی روی پورت ${port}...`);
console.log(`====================================================================\n`);

async function getLocaltunnelUrl() {
  try {
    const localtunnel = (await import('localtunnel')).default;
    const tunnel = await localtunnel({ port: Number(port) });
    console.log(`🎉 لینک اینترنتی شما با موفقیت فعال شد:`);
    console.log(`👉 \x1b[32m\x1b[1m${tunnel.url}\x1b[0m\n`);
    console.log(`💡 برای دیدن IP تاییدیه لوکال‌تونل در صورت درخواست رمز:`);
    
    https.get('https://loca.lt/mytunnelpassword', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (data.trim()) console.log(`🔑 رمز ورود به تونل (Password): \x1b[33m${data.trim()}\x1b[0m\n`);
      });
    }).on('error', () => {});

    tunnel.on('close', () => {
      console.log('🔴 تونل بسته شد.');
    });
  } catch (err) {
    console.log('⚠️ خطا در ساخت localtunnel، در حال تست روش دوم (SSH Tunnel)...');
    console.log(`لطفاً دستور زیر را در ترموکس بزنید:\nssh -R 80:localhost:${port} localhost.run`);
  }
}

getLocaltunnelUrl();
