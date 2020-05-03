import { DebugConfiguration } from '@aurelia/debug';
import { JitHtmlBrowserConfiguration } from '@aurelia/jit-html-browser';
import { DI } from '@aurelia/kernel';
import { Aurelia } from '@aurelia/runtime';
import { App as component } from './app';

(async function () {
  const host = document.querySelector('app');

  const container = DI.createContainer();

  const au = new Aurelia(container)
    .register(
      JitHtmlBrowserConfiguration,
      DebugConfiguration,
    );
  au.app({ host, component });

  await au.start().wait();
})().catch(console.error);
