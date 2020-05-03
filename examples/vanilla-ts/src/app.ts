import { customElement } from '@aurelia/runtime';

@customElement({ name: 'app', template:`<div>\${message}</div>` })
export class App {
  public message = 'Hello World!';
}
