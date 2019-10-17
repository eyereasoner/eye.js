import { spawn } from 'child_process';
import { file, FileResult } from 'tmp-promise';
import { writeFile } from 'fs';

export default class Eye {

    private readonly commentRegex = /^#.*$\n/mg;
    private readonly localIdentifierRegex = /<\/tmp\/([^#]+)#([^>]+>)/g;
    private readonly prefixDeclarationRegex = /^@prefix|PREFIX ([\w\-]*:) <([^>]+)>\.?\n/g;
    private readonly eyeSignatureRegex = /^(Id: euler\.yap|EYE)/m;
    private readonly errorRegex = /^\*\* ERROR \*\*\s*(.*)$/m;

    private eyePath: string;

    constructor() {
        this.eyePath = process.platform === 'win32' ? 'eye.cmd' : 'eye';
    }

    public async callTmp(files: string[], query: string, flags?: Array<string>): Promise<FileResult> {
        const tmp = await file();
        await this.callFile(files, query, tmp.path, flags);
        return tmp;
    }

    public async callFile(files: string[], query: string, path: string, flags?: Array<string>): Promise<string> {
        const output = await this.call(files, query, flags);

        return new Promise(resolve => {
            writeFile(path, output, (err) => {
                if (err) throw err;
                resolve(path);
            });
        });
    }

    public call(files: string[], query: string, flags?: Array<string>): Promise<string> {
        const params = files.concat('--query', query, '--nope', flags ? flags : []);
        const eye = spawn(this.eyePath, params);

        console.log(`==> Call to EYE:\n${params.join('\n')}\n\n`);

        let output: string = '';
        let error: string = '';

        eye.stdout.on('data', data => output += data);
        eye.stderr.on('data', data => error += data);

        return new Promise((resolve, reject) => {
            eye.once('error', error => {
                eye.removeAllListeners();
                return reject(error)
            });
            eye.once('close', (code: number) => {
                eye.removeAllListeners();
                console.log(`Response from EYE (${code}) (${params.join(' ')})`);
                return (code === 0) ? resolve(this.clean(output)) : reject(error);
            });
        });
    }

    public clean(n3: string) {
        // remove comments
        n3 = n3.replace(this.commentRegex, '');

        // remove prefix declarations from the document, storing them in an object
        var prefixes: {[key: string]: string} = {};
        n3 = n3.replace(this.prefixDeclarationRegex, (match, prefix, namespace) => {
            prefixes[prefix] = namespace.replace(/^file:\/\/.*?([^\/]+)$/, '$1');
            return '';
        });

        // remove unnecessary whitespace from the document
        n3 = n3.trim();

        // find the used prefixes
        var prefixLines = [];
        for (var prefix in prefixes) {
            var namespace = prefixes[prefix];

            // EYE does not use prefixes of namespaces ending in a slash (instead of a hash),
            // so we apply them manually
            if (namespace.match(/\/$/))
                // warning: this could wreck havoc inside string literals
                n3 = n3.replace(new RegExp('<' + this.escapeForRegExp(namespace) + '(\\w+)>', 'gm'), prefix + '$1');

            // add the prefix if it's used
            // (we conservatively employ a wide definition of "used")
            if (n3.match(prefix))
                prefixLines.push("PREFIX ", prefix, " <", namespace, ">\n");
        }

        // join the used prefixes and the rest of the N3
        return !prefixLines.length ? n3 : (prefixLines.join('') + '\n' + n3);
    }

    private escapeForRegExp(text: string) {
        return text.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    }

}
