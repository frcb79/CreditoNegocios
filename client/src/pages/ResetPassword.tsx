import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, CheckCircle, XCircle } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      setError("No se encontró el token de recuperación. Por favor solicita uno nuevo.");
    }
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden",
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
        throw new Error(data.message || "Error al restablecer contraseña");
      }
      
      setResetComplete(true);
      toast({
        title: "¡Contraseña actualizada!",
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al restablecer contraseña",
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img 
              src="/credito-negocios-full-logo.jpg" 
              alt="Credito Negocios Logo" 
              className="w-64 h-auto mx-auto mb-4"
            />
          </div>

          <Card className="shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex justify-center mb-4">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <CardTitle className="text-xl text-center text-red-600">
                Enlace inválido
              </CardTitle>
              <CardDescription className="text-center">
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={handleGoToLogin}
                data-testid="button-go-to-login"
              >
                Ir a iniciar sesión
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state
  if (resetComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img 
              src="/credito-negocios-full-logo.jpg" 
              alt="Credito Negocios Logo" 
              className="w-64 h-auto mx-auto mb-4"
            />
          </div>

          <Card className="shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-xl text-center text-green-600">
                ¡Contraseña actualizada!
              </CardTitle>
              <CardDescription className="text-center">
                Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full" 
                onClick={handleGoToLogin}
                data-testid="button-go-to-login-success"
              >
                Iniciar sesión
              </Button>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-gray-500 mt-6">
            © 2025 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
          </p>
        </div>
      </div>
    );
  }

  // Reset password form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="/credito-negocios-full-logo.jpg" 
            alt="Credito Negocios Logo" 
            className="w-64 h-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900">
            Plataforma de Gestión Financiera
          </h1>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">
              Restablecer contraseña
            </CardTitle>
            <CardDescription className="text-center">
              Ingresa tu nueva contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    minLength={6}
                    required
                    disabled={isLoading}
                    data-testid="input-new-password"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    minLength={6}
                    required
                    disabled={isLoading}
                    data-testid="input-confirm-password"
                  />
                </div>
              </div>

              {password && confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-red-500">Las contraseñas no coinciden</p>
              )}
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || password !== confirmPassword}
                data-testid="button-reset-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restableciendo...
                  </>
                ) : (
                  "Restablecer contraseña"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
        </p>
      </div>
    </div>
  );
}
