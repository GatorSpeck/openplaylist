# Backup/Restore Instructions

## Backing Up (MySQL/MariaDB)
`mysqldump -h localhost -P 3306 -u mysql_root -p old_db_name > backup.tmp`

## Restoring (MySQL/MariaDB)
`mysql -h localhost -P 3306 -u mysql_root -p new_db_name < backup.tmp`

## Creating database
In MySQL shell:
- `create database dbname;`
- `use dbname.*;`
- `grant all privileges on dbname to 'user'@'%';`