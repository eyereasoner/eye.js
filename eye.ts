import { spawn } from 'child_process';
import { file, FileResult } from 'tmp-promise';
import { promises as fs } from 'fs';

export default class Eye {

    private readonly commentRegex = /^#.*$\n/mg;
    private readonly localIdentifierRegex = /<\/tmp\/([^#]+)#([^>]+>)/g;
    private readonly prefixDeclarationRegex = /^@prefix|PREFIX ([\w\-]*:) <([^>]+)>\.?\n/g;
    private readonly eyeSignatureRegex = /^(Id: euler\.yap|EYE)/m;
    private readonly errorRegex = /^\*\* ERROR \*\*\s*(.*)$/m;

    private readonly flags: Array<String> = ['nope', 'noBranch', 'noDistinct', 'noQvars',
        'noQnames', 'quiet', 'quickFalse', 'quickPossible',
        'quickAnswer', 'think', 'ances', 'ignoreSyntaxError',
        'pcl', 'strings', 'debug', 'profile', 'version', 'help',
        'pass', 'passAll', 'traditional'];

    private options: Object = {
        nope: true,
        data: []
    };
    private eyePath: string;
    private eye;

    constructor(options?: Object) {
        this.options = options || {};

        this.eyePath = options.eyePath || /^win/.test(process.platform) ? 'eye.cmd' : 'eye';

    }

    private clean(n3) {
        // remove comments
        n3 = n3.replace(this.commentRegex, '');

        // remove prefix declarations from the document, storing them in an object
        var prefixes = {};
        n3 = n3.replace(this.prefixDeclarationRegex, function (match, prefix, namespace) {
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

    private addDataItem(dataItem, modifier) {
        // does it contain a protocol name of some sort?
        if (dataItem.match(/^[a-zA-Z0-9]+:/)) {
            // is it HTTP(S), but not on a reserved domain?
            if (dataItem.match(/^https?:\/\/(?!localhost|127\.0\.0\.1|[0:]*:1)/)) {
                // cache the resource and add it
                self.resourceCache.cacheFromUrl(dataItem, 'text/n3,text/turtle,*/*;q=.1', this.addResourceCallback(dataItem, modifier));
            }
        }
        // the data resource is assumed to be N3 now,
        // so a new data resource has to be created from the N3 string
        else {
            // cache the N3 string in a file and add it
            self.resourceCache.cacheFromString(dataItem, this.addResourceCallback("tmp/" + (++localResources), modifier));
        }
    }

    // returns a callback that will pass the resource to EYE
    private addResourceCallback(uri, modifier) {
        // pass possible data modifier (such as '--query')
        if (typeof (modifier) === 'string')
            args.push(modifier);
        // pass the URI of the cached item
        args.push(uri);

        // since the resource cache file will be created asynchronously,
        // we need to keep track of the number of pending resources.
        resourcesPending++;
        // return a callback for resourceCache
        return function (err, cacheFile) {
            if (err) {
                if (callback) {
                    callback(err, null);
                    callback = null;
                }
                return;
            }

            // tell in what file the resource with the URI has been cached
            args.push("--wcache");
            args.push(uri);
            args.push(cacheFile);

            // keep track of gathered resources
            resources.push(cacheFile);
            resourcesPending--;

            // start EYE if no more resources are pending
            if (!resourcesPending)
                this.startEye();
        };
    }

    private startEye(callback) {
        // make sure not to start EYE twice
        if (this.eye)
            return;

        // start EYE
        this.eye = (self.spawn || spawn)(this.eyePath, args);
        this.eye.on('error', callback);

        // capture stdout
        let output = "";
        this.eye.stdout.on('data', (data) => {
            output += data;
        });
        this.eye.stdout.once('end', () => {
            this.eye.stdout.finished = true;
            this.eye.stdout.removeAllListeners();
            this.eyeFinished(error, output, callback);
        });

        // capture stderr
        let error = "";
        this.eye.stderr.on('data', (data) => {
            error += data;
        });
        this.eye.stderr.once('end', () => {
            this.eye.stderr.finished = true;
            this.eye.stderr.removeAllListeners();
            this.eyeFinished(error, output, callback);
        });
    }
    // after both streams are complete, report output or error
    private eyeFinished(error, output, callback) {
        if (!(this.eye.stdout.finished && this.eye.stderr.finished))
            return;

        resources.forEach(function (resource) {
            self.resourceCache.release(resource, function () { });
        });

        if (callback) {
            // has EYE not been executed?
            if (!error.match(eyeSignatureRegex))
                callback(error, null);
            // EYE has been executed
            else {
                var errorMatch = error.match(errorRegex);
                // did EYE report errors?
                if (errorMatch)
                    callback(errorMatch[1], null);
                // EYE reported no errors
                else
                    callback(null, this.clean(output));
            }
            callback = null;
        }
        this.eye = null;
    }

    private stopEye() {
        if (this.eye) {
            this.eye.removeAllListeners('exit');
            this.eye.stdout.removeAllListeners();
            this.eye.stderr.removeAllListeners();
            this.eye.kill();
            this.eye = null;
        }
    }

    public execute(options, callback) {

        // set correct argument values (options is optional)
        if (typeof (options) === 'function') {
            callback = options;
            options = {};
        }

        // add default options if applicable
        options = options || {};
        for (var prop in this.options) {
            if (this.options.hasOwnProperty(prop) && typeof (options[prop]) === 'undefined') {
                options[prop] = this.options[prop];
            }
        }

        // do a pass if no query specified, and pass not explicitely disabled
        if (!options.query && typeof (options.pass) === 'undefined')
            options.pass = true;

        // set EYE commandline arguments according to options
        var eye,
            args = [],
            resources = [],
            resourcesPending = 0,
            localResources = 0;
        flags.forEach(function (name) {
            if (options[name]) {
                args.push('--' + name.replace(/([A-Z])/g, '-$1').toLowerCase());
            }
        });

        // add data URIs
        if (typeof (options.data) === "string")
            options.data = [options.data];
        options.data.forEach(addDataItem);

        // add query URI
        if (typeof (options.query) === "string")
            this.addDataItem(options.query, '--query');
        else if (options.query instanceof Array)
            this.addDataItem(options.query[0], '--query');

        // start EYE if no more resources are pending
        if (!resourcesPending)
            this.startEye();

        // return status object
        var status = new EventEmitter();
        status.cancel = stopEye;
        return status;
    }

    private escapeForRegExp(text) {
        return text.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
    }
}
