import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests/browser',testMatch:'*.spec.mjs',workers:1,timeout:45000,
 outputDir:'.local/browser-results',reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:4175',headless:true,trace:'off',screenshot:'only-on-failure',launchOptions:process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}},
 projects:[{name:'Chrome desktop',use:{viewport:{width:1440,height:1000}}},{name:'Chrome mobile emulation',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}}],
 webServer:{command:'node tests/browser/server.mjs',url:'http://127.0.0.1:4175/__qa/state',reuseExistingServer:false,timeout:30000}
});
