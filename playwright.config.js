const { defineConfig } = require('@playwright/test');
 
module.exports = defineConfig({
 
  //testDir: './',
  fullyParallel: false,
  workers: 4,
  timeout: 3600000,
  //retries: 1,
 
  reporter: [
    ['list'],
    ['html' , { open: 'never' }],
  ],
 
  use: {
   
    launchOptions: {
      args: ["--start-maximized", "--disable-web-security","--incognito"],
   
    },
 
    trace: 'off',
    video: 'on',
    screenshot: 'on'
  },
 
  projects: [
    {
        name: 'chromium',
        use: {
         
          headless: false,
         // maxConcurrency: 10,
          viewport: null,
        },
    },
 
  ],
 
});