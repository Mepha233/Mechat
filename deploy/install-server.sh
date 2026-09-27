#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/mechat/app
ENV_DIR=/etc/mechat
ENV_FILE=${ENV_DIR}/mechat.env
SEED_ENV=${1:-${ENV_DIR}/mechat.env.seed}
DB_USER=mechat
DB_NAME=mechat

if ! getent group mechat >/dev/null; then
  groupadd --system mechat
fi
if ! id -u mechat >/dev/null 2>&1; then
  useradd --system --gid mechat --home-dir /opt/mechat --shell /usr/sbin/nologin mechat
fi

read_seed_value() {
  local name=$1
  if [[ -f "${SEED_ENV}" ]]; then
    grep -m1 "^${name}=" "${SEED_ENV}" | cut -d= -f2- || true
  fi
}

DEMO_USER_ID=$(read_seed_value DEMO_USER_ID)
DEMO_USERNAME=$(read_seed_value DEMO_USERNAME)
DEMO_PASSWORD=$(read_seed_value DEMO_PASSWORD)
SESSION_SECRET=$(read_seed_value SESSION_SECRET)
DASHSCOPE_API_KEY=$(read_seed_value DASHSCOPE_API_KEY)

: "${DEMO_USER_ID:=demo-mepha}"
: "${DEMO_USERNAME:=mepha}"
: "${DEMO_PASSWORD:=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)}"
if [[ ${#SESSION_SECRET} -lt 32 ]]; then
  SESSION_SECRET=$(openssl rand -hex 32)
fi

DB_PASSWORD=$(openssl rand -hex 24)

sudo -u postgres psql --set=ON_ERROR_STOP=1 --quiet <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb --owner="${DB_USER}" "${DB_NAME}"
fi

install -d -o root -g mechat -m 0750 "${ENV_DIR}"
umask 0077
cat >"${ENV_FILE}" <<EOF
DEMO_USER_ID=${DEMO_USER_ID}
DEMO_USERNAME=${DEMO_USERNAME}
DEMO_PASSWORD=${DEMO_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
SESSION_COOKIE_SECURE=true
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_CHAT_MODEL=qwen-plus
DASHSCOPE_EMBEDDING_MODEL=qwen3.7-text-embedding-flash
CHROMA_HOST=127.0.0.1
CHROMA_PORT=8000
CHROMA_SSL=false
CHROMA_COLLECTION=wiki_knowledge_v1
EOF
chown root:mechat "${ENV_FILE}"
chmod 0640 "${ENV_FILE}"

cd "${APP_DIR}"
npm ci
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a
npm run db:migrate
npm run build
chown -R mechat:mechat "${APP_DIR}"
find "${APP_DIR}" -type d -exec chmod u=rwx,go=rx {} +
find "${APP_DIR}" -type f -exec chmod u=rw,go=r {} +

install -m 0644 "${APP_DIR}/deploy/chroma.service" /etc/systemd/system/chroma.service
install -m 0644 "${APP_DIR}/deploy/mechat.service" /etc/systemd/system/mechat.service
install -m 0644 "${APP_DIR}/deploy/ai.mepha.fun.nginx.conf" /etc/nginx/sites-available/ai.mepha.fun
ln -sfn /etc/nginx/sites-available/ai.mepha.fun /etc/nginx/sites-enabled/ai.mepha.fun

systemctl daemon-reload
systemctl enable --now chroma.service
systemctl enable --now mechat.service
nginx -t
systemctl reload nginx

echo "DEPLOYMENT_COMPLETE"
if [[ -z "${DASHSCOPE_API_KEY}" ]]; then
  echo "DASHSCOPE_API_KEY_MISSING"
fi
if [[ ! -f "${SEED_ENV}" ]]; then
  echo "RANDOM_DEMO_PASSWORD_GENERATED"
fi
