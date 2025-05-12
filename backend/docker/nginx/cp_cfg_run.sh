cp default /etc/nginx/sites-available/
cp nginx.conf /etc/nginx
nginx -t

/etc/init.d/nginx restart