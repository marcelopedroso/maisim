/* stdio.h mínimo do MaiSim para o TinyCC embutido (veja o LEIA.md): o printf vai para o log do controle */
#ifndef MAISIM_LIBC_STDIO_H
#define MAISIM_LIBC_STDIO_H
#include <stddef.h>
#include <stdarg.h>

typedef struct _IO_FILE FILE;
extern FILE *stdin, *stdout, *stderr;
#define EOF (-1)

int printf(const char *, ...);
int fprintf(FILE *, const char *, ...);
int sprintf(char *, const char *, ...);
int snprintf(char *, size_t, const char *, ...);
int vprintf(const char *, va_list);
int vfprintf(FILE *, const char *, va_list);
int vsnprintf(char *, size_t, const char *, va_list);
int puts(const char *);
int putchar(int);
int fputs(const char *, FILE *);
int fflush(FILE *);
FILE *fopen(const char *, const char *);
int fclose(FILE *);
char *fgets(char *, int, FILE *);

#endif
