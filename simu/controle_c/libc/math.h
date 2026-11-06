/* math.h mínimo do MaiSim para o TinyCC embutido (veja o LEIA.md): as funções são as da libm do sistema */
#ifndef MAISIM_LIBC_MATH_H
#define MAISIM_LIBC_MATH_H

#define NAN (0.0f / 0.0f)
#define INFINITY (1e5000f)
#define HUGE_VAL (1e5000)
#define HUGE_VALF (1e5000f)
#define isnan(x) ((x) != (x))
#define isfinite(x) (((x) - (x)) == 0)
#define isinf(x) ((x) == (x) && ((x) - (x)) != 0)

#define M_E        2.7182818284590452354
#define M_LOG2E    1.4426950408889634074
#define M_LOG10E   0.43429448190325182765
#define M_LN2      0.69314718055994530942
#define M_LN10     2.30258509299404568402
#define M_PI       3.14159265358979323846
#define M_PI_2     1.57079632679489661923
#define M_PI_4     0.78539816339744830962
#define M_1_PI     0.31830988618379067154
#define M_2_PI     0.63661977236758134308
#define M_2_SQRTPI 1.12837916709551257390
#define M_SQRT2    1.41421356237309504880
#define M_SQRT1_2  0.70710678118654752440

double sin(double), cos(double), tan(double), asin(double), acos(double), atan(double), atan2(double, double);
double sinh(double), cosh(double), tanh(double), asinh(double), acosh(double), atanh(double);
double exp(double), exp2(double), expm1(double), log(double), log10(double), log2(double), log1p(double);
double pow(double, double), sqrt(double), cbrt(double), hypot(double, double);
double fabs(double), floor(double), ceil(double), round(double), trunc(double), rint(double), nearbyint(double);
double fmod(double, double), remainder(double, double), fmin(double, double), fmax(double, double), fdim(double, double);
double fma(double, double, double), copysign(double, double), ldexp(double, int), frexp(double, int *), modf(double, double *);
long lround(double), lrint(double);

float sinf(float), cosf(float), tanf(float), asinf(float), acosf(float), atanf(float), atan2f(float, float);
float sinhf(float), coshf(float), tanhf(float), expf(float), logf(float), log10f(float), log2f(float), powf(float, float);
float sqrtf(float), cbrtf(float), hypotf(float, float), fabsf(float), floorf(float), ceilf(float), roundf(float), truncf(float);
float fmodf(float, float), fminf(float, float), fmaxf(float, float), copysignf(float, float);

#endif
