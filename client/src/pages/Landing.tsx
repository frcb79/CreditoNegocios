import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, User, ArrowLeft } from "lucide-react";

export default function Landing() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Register form state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Error al iniciar sesión");
      }
      
      toast({
        title: "¡Bienvenido!",
        description: "Iniciando sesión...",
      });
      
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al iniciar sesión",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          firstName: registerFirstName,
          lastName: registerLastName,
        }),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Error al registrar");
      }
      
      toast({
        title: "¡Registro exitoso!",
        description: "Tu cuenta ha sido creada. Iniciando sesión...",
      });
      
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al registrar",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotPasswordEmail }),
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Error al procesar solicitud");
      }
      
      setResetEmailSent(true);
      toast({
        title: "Solicitud enviada",
        description: data.message,
      });
      
      // If we have a reset URL in development mode, show it
      if (data.resetUrl) {
        console.log("Reset URL (dev mode):", data.resetUrl);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Error al procesar solicitud",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setResetEmailSent(false);
    setForgotPasswordEmail("");
  };

  // Forgot Password View
  if (showForgotPassword) {
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
                {resetEmailSent ? "Revisa tu email" : "Recuperar contraseña"}
              </CardTitle>
              <CardDescription className="text-center">
                {resetEmailSent 
                  ? "Te hemos enviado instrucciones para restablecer tu contraseña"
                  : "Ingresa tu email y te enviaremos instrucciones"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resetEmailSent ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                    <p className="text-green-800 text-sm">
                      Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleBackToLogin}
                    data-testid="button-back-to-login"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a iniciar sesión
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        data-testid="input-forgot-email"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-forgot-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar instrucciones"
                    )}
                  </Button>
                  
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full" 
                    onClick={handleBackToLogin}
                    disabled={isLoading}
                    data-testid="button-cancel-forgot"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a iniciar sesión
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-sm text-gray-500 mt-6">
            © 2025 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
          </p>
        </div>
      </div>
    );
  }

  // Main Login/Register View
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
          <p className="text-gray-600 mt-2">
            Gestiona tu cartera de clientes, créditos y comisiones
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Accede a tu cuenta</CardTitle>
            <CardDescription className="text-center">
              Ingresa con tu email para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="tab-login">Iniciar Sesión</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Registrarse</TabsTrigger>
              </TabsList>
              
              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLocalLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        data-testid="input-login-email"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Contraseña</Label>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        data-testid="link-forgot-password"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        data-testid="input-login-password"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-login-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando sesión...
                      </>
                    ) : (
                      "Iniciar Sesión"
                    )}
                  </Button>
                </form>
              </TabsContent>
              
              {/* Register Tab */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-firstname">Nombre</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="register-firstname"
                          type="text"
                          placeholder="Juan"
                          value={registerFirstName}
                          onChange={(e) => setRegisterFirstName(e.target.value)}
                          className="pl-10"
                          required
                          disabled={isLoading}
                          data-testid="input-register-firstname"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-lastname">Apellido</Label>
                      <Input
                        id="register-lastname"
                        type="text"
                        placeholder="Pérez"
                        value={registerLastName}
                        onChange={(e) => setRegisterLastName(e.target.value)}
                        required
                        disabled={isLoading}
                        data-testid="input-register-lastname"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                        data-testid="input-register-email"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Contraseña</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                        required
                        disabled={isLoading}
                        data-testid="input-register-password"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                    data-testid="button-register-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      "Crear Cuenta"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
        </p>
      </div>
    </div>
  );
}
