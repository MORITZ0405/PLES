import type { VhostSpec } from '@lest/core';

/**
 * Render an nginx server block from a fully-validated VhostSpec.
 *
 * This is a pure string builder, NOT a template language: every interpolated value
 * (fqdn, aliases, docRoot, phpVersion) has already passed the branded Zod grammar at
 * the boundary, so no nginx-directive injection is reachable here. We additionally
 * assert the invariants to fail closed if a caller bypassed validation.
 */
export function renderNginxVhost(spec: VhostSpec): string {
  assertSafeServerName(spec.fqdn);
  spec.aliases.forEach(assertSafeServerName);
  assertSafePath(spec.docRoot);

  const serverName = [spec.fqdn, ...spec.aliases].join(' ');
  const phpBlock = spec.phpVersion ? renderPhpLocation(spec.phpVersion) : '';

  const httpBody =
    spec.httpsMode === 'redirect' || spec.httpsMode === 'only'
      ? `    return 301 https://$host$request_uri;\n`
      : `    root ${spec.docRoot};
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
${phpBlock}`;

  let conf = `# Managed by LEST — do not edit by hand.
# fqdn: ${spec.fqdn}
# domainId: ${spec.domainId}
server {
    listen 80;
    listen [::]:80;
    server_name ${serverName};

    access_log /var/log/nginx/${spec.fqdn}.access.log;
    error_log  /var/log/nginx/${spec.fqdn}.error.log;

${httpBody}}
`;

  if (spec.httpsMode !== 'off' && spec.certPath && spec.keyPath) {
    assertSafePath(spec.certPath);
    assertSafePath(spec.keyPath);
    conf += `
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${serverName};

    ssl_certificate ${spec.certPath};
    ssl_certificate_key ${spec.keyPath};

    root ${spec.docRoot};
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
${phpBlock}}
`;
  }

  return conf;
}

function renderPhpLocation(phpVersion: string): string {
  return `
    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php${phpVersion}-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
`;
}

const SERVER_NAME_RE = /^[a-z0-9.*_-]+$/;
function assertSafeServerName(name: string): void {
  if (!SERVER_NAME_RE.test(name)) {
    throw new Error(`unsafe server_name reached renderer: ${JSON.stringify(name)}`);
  }
}

function assertSafePath(p: string): void {
  if (!p.startsWith('/') || p.includes('\n') || p.includes(';') || p.split('/').includes('..')) {
    throw new Error(`unsafe path reached renderer: ${JSON.stringify(p)}`);
  }
}
