import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { writeFile } from 'fs';
import { file, FileResult } from 'tmp-promise';

interface IEyeOptions {
    spawn: (command: string, args: string[]) => ChildProcessWithoutNullStreams;
}


export default class Eye {

    private readonly commentRegex = /^#.*$\n/mg;
    private readonly localIdentifierRegex = /<\/tmp\/([^#]+)#([^>]+>)/g;
    private readonly prefixDeclarationRegex = /^@prefix|PREFIX ([\w\-]*:) <([^>]+)>\.?\n/g;
    private readonly eyeSignatureRegex = /^(Id: euler\.yap|EYE)/m;
    private readonly errorRegex = /^\*\* ERROR \*\*\s*(.*)$/m;

    private eyePath: string;
    private options: IEyeOptions;
    private spawn: (command: string, args: string[]) => ChildProcessWithoutNullStreams;

    constructor(options?: IEyeOptions) {
        this.options = options || { spawn };

        this.eyePath = process.platform === 'win32' ? 'eye.cmd' : 'eye';
        this.spawn = this.options.spawn;
    }

    public async queryTmp(files: string[], query: string, flags?: string[]): Promise<FileResult> {
        const tmp = await file();
        await this.queryFile(files, query, tmp.path, flags);
        return tmp;
    }

    public async queryFile(files: string[], query: string, path: string, flags?: string[]): Promise<string> {
        const output = await this.query(files, query, flags);

        return new Promise(resolve => {
            writeFile(path, output, (err) => {
                if (err)
                    throw err;
                resolve(path);
            });
        });
    }

    public pass(files: string[], flags?: string[]): Promise<string> {
        const params = files.concat('--nope', flags ? flags : []);
        const eye = this.spawn(this.eyePath, params);

        let output: string = '';
        let error: string = '';

        eye.stdout.on('data', data => output += data);
        eye.stderr.on('data', data => error += data);

        return new Promise((resolve, reject) => {
            eye.once('error', e => {
                eye.removeAllListeners();
                return reject(e);
            });
            eye.stdout.once('end', () => {
                eye.stdout.removeAllListeners();
                resolve(this.eyeFinished(error, output));
            });

            eye.stderr.once('end', () => {
                eye.stderr.removeAllListeners();
                resolve(this.eyeFinished(error, output));
            });
        });

    }

    public query(files: string[], query: string, flags?: string[]): Promise<string> {
        return this.pass(files.concat('--query', query), flags);
    }

    public clean(n3: string) {
        // remove comments
        n3 = n3.replace(this.commentRegex, '');

        // remove prefix declarations from the document, storing them in an object
        const prefixes: { [key: string]: string } = {};
        n3 = n3.replace(this.prefixDeclarationRegex, (match, prefix, namespace) => {
            prefixes[prefix] = namespace.replace(/^file:\/\/.*?([^\/]+)$/, '$1');
            return '';
        });

        // remove unnecessary whitespace from the document
        n3 = n3.trim();

        // find the used prefixes
        const prefixLines = [];
        for (const prefix of Object.keys(prefixes)) {
            const namespace = prefixes[prefix];

            // EYE does not use prefixes of namespaces ending in a slash (instead of a hash),
            // so we apply them manually
            if (namespace.match(/\/$/)) 
                // warning: this could wreck havoc inside string literals
                n3 = n3.replace(new RegExp('<' + this.escapeForRegExp(namespace) + '(\\w+)>', 'gm'), prefix + '$1');
            

            // add the prefix if it's used
            // (we conservatively employ a wide definition of "used")
            if (n3.match(prefix))
                prefixLines.push('PREFIX ', prefix, ' <', namespace, '>\n');
        }

        // join the used prefixes and the rest of the N3
        return !prefixLines.length ? n3 : (prefixLines.join('') + '\n' + n3);
    }

    // after both streams are complete, report output or error
    private eyeFinished(error: string, output: string): string {
        // if (!(eye.stdout.finished && eye.stderr.finished))
        //     return '';

        // resources.forEach(function (resource) {
        //     self.resourceCache.release(resource, function () { });
        // });

        // has EYE not been executed?
        if (!error.match(this.eyeSignatureRegex))
            throw new Error(error);
        // EYE has been executed
        else {
            const errorMatch = error.match(this.errorRegex);
            // did EYE report errors?
            if (errorMatch)
                throw new Error(errorMatch[1]);
            // EYE reported no errors
            else
                return this.clean(output);
        }
    }

    private stopEye(eye: ChildProcessWithoutNullStreams) {
        if (eye) {
            eye.removeAllListeners('exit');
            eye.stdout.removeAllListeners();
            eye.stderr.removeAllListeners();
            eye.kill();
        }
    }

    private escapeForRegExp(text: string) {
        return text.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
    }

    private async stringToTmp(input: string):  Promise<FileResult> {
        const tmp = await file();
        return new Promise(resolve => {
            writeFile(tmp.path, input, (err) => {
                if (err)
                    throw err;
                resolve(tmp);
            });
        });  
    }

}
