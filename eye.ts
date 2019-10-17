import { spawn } from 'child_process';
import { file, FileResult } from 'tmp-promise';
import { promises as fs } from 'fs';

export default class Eye {

  constructor() { }

  public async callTmp(files: string[], query: string, options?: Array<string>): Promise<FileResult> {
    const tmp = await file();
    await this.callFile(files, query, tmp.path, options);
    return tmp;
  }

  public async callFile(files: string[], query: string, path: string, options?: Array<string>): Promise<string> {
    const output = await this.call(files, query, options);
    await fs.writeFile(path, output);
    return path;
  }

  public async call(files: string[], query: string, options?: Array<string>): Promise<string> {
    const params = files.concat('--query', query, '--nope', options ? options : []);
    const eye = spawn(process.platform === 'win32' ? 'eye.cmd' : 'eye', params);

    console.log(`==> Call to EYE:\n${params.join('\n')}\n\n`);

    eye.on('error', e => {
      console.error(e);
      eye.removeAllListeners();
    });

    let output: string = '';
    let error: string = '';
    
    eye.stdout.on('data', data => output += data);
    eye.stderr.on('data', data => error += data);
    
    return new Promise((resolve, reject) => {
      eye.on('error', error => {
        eye.removeAllListeners();
        reject(error)
      });
      eye.on('close', async code => {
        eye.removeAllListeners();
        console.log(`Response from EYE (${params.join(' ')})`);
        return (code === 0) ? resolve(output) : reject(error);
      });
    });
  }
}
