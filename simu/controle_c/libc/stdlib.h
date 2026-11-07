/* stdlib.h mínimo do MaiSim para o TinyCC embutido (veja o LEIA.md) */
#ifndef MAISIM_LIBC_STDLIB_H
#define MAISIM_LIBC_STDLIB_H
#include <stddef.h>

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1

int abs(int);
long labs(long);
long long llabs(long long);
double atof(const char *);
int atoi(const char *);
double strtod(const char *, char **);
long strtol(const char *, char **, int);
void *malloc(size_t);
void *calloc(size_t, size_t);
void *realloc(void *, size_t);
void free(void *);
void exit(int);
void qsort(void *, size_t, size_t, int (*)(const void *, const void *));

#endif
