import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, CheckCircle2, XCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError("No se encontró el token de seguridad o activación. Por favor solicita un nuevo enlace.");
    }
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden. Por favor verifícalas.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Error al establecer la contraseña");
      }
      
      setResetComplete(true);
      toast({
        title: "¡Contraseña guardada!",
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al establecer la contraseña",
        variant: "destructive",
      });
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoToLogin = () => {
    setLocation("/");
  };

  // Error state
  if (error && !token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <img 
              src="/credito-negocios-07.jpg" 
              alt="Crédito Negocios" 
              className="h-14 w-auto mx-auto mb-4 rounded-md shadow-xs object-contain"
            />
          </div>

          <Card className="shadow-xl shadow-slate-900/5 border border-slate-200/80 bg-white rounded-2xl">
            <CardHeader className="space-y-1 pb-4 text-center">
              <div className="flex justify-center mb-3">
                <XCircle className="h-14 w-14 text-red-500" />
              </div>
              <CardTitle className="text-xl font-bold text-red-600">
                Enlace no válido
              </CardTitle>
              <CardDescription className="text-slate-600 text-sm">
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
                onClick={handleGoToLogin}
                data-testid="button-go-to-login"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Ir a iniciar sesión
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500 mt-6">
            © 2026 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (resetComplete) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6">
            <img 
              src="/credito-negocios-07.jpg" 
              alt="Crédito Negocios" 
              className="h-14 w-auto mx-auto mb-4 rounded-md shadow-xs object-contain"
            />
          </div>

          <Card className="shadow-xl shadow-slate-900/5 border border-slate-200/80 bg-white rounded-2xl">
            <CardHeader className="space-y-1 pb-4 text-center">
              <div className="flex justify-center mb-3">
                <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              </div>
              <CardTitle className="text-xl font-bold text-emerald-700">
                ¡Contraseña establecida!
              </CardTitle>
              <CardDescription className="text-slate-600 text-sm">
                Tu contraseña ha sido guardada exitosamente. Ya puedes iniciar sesión con tu cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
                onClick={handleGoToLogin}
                data-testid="button-go-to-login-success"
              >
                Ir a iniciar sesión
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500 mt-6">
            © 2026 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
          </p>
        </div>
      </div>
    );
  }

  // Set password form (universal for reset or activation)
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img 
            src="/credito-negocios-07.jpg" 
            alt="Crédito Negocios" 
            className="h-14 w-auto mx-auto mb-4 rounded-md shadow-xs object-contain"
          />
          <h1 className="text-2xl font-black text-slate-900">
            Plataforma de Gestión Financiera
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Establecimiento de contraseña de acceso
          </p>
        </div>

        <Card className="shadow-xl shadow-slate-900/5 border border-slate-200/80 bg-white rounded-2xl">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-bold text-slate-900">
              Establecer contraseña
            </CardTitle>
            <CardDescription className="text-slate-600 text-sm">
              Guarda una contraseña para acceder a tu cuenta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nueva contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 border-slate-200 bg-slate-50 focus:bg-white"
                    minLength={6}
                    required
                    disabled={isLoading}
                    data-testid="input-new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Confirmar contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 border-slate-200 bg-slate-50 focus:bg-white"
                    minLength={6}
                    required
                    disabled={isLoading}
                    data-testid="input-confirm-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-600 font-medium">Las contraseñas no coinciden.</p>
              )}
              
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
                disabled={isLoading || (Boolean(password && confirmPassword && password !== confirmPassword))}
                data-testid="button-reset-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar contraseña"
                )}
              </Button>

              <Button 
                type="button"
                variant="ghost" 
                className="w-full text-slate-600 hover:text-slate-900" 
                onClick={handleGoToLogin}
                disabled={isLoading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al inicio de sesión
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
        </p>
      </div>
    </div>
  );
}
