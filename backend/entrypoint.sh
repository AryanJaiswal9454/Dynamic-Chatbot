#!/bin/sh
set -e

if [ "${DB_ENGINE:-mysql}" != "sqlite" ] && [ -n "$DB_HOST" ]; then
  echo "Waiting for the database at $DB_HOST:${DB_PORT:-3306}..."
  i=0
  until nc -z "$DB_HOST" "${DB_PORT:-3306}" || [ "$i" -ge 30 ]; do
    i=$((i + 1))
    sleep 2
  done
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Optional: create the first admin from environment variables (remove the password variable afterwards).
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput || true
fi

exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --timeout 90