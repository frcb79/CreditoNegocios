import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Lock, User, ArrowLeft, Key, Tag, Eye, EyeOff, ArrowRight } from "lucide-react";

export default function Landing() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [directResetUrl, setDirectResetUrl] = useState<string | null>(null);
  
  // Password visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Register form state
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerReferralCode, setRegisterReferralCode] = useState("");
  const [registerPromoCode, setRegisterPromoCode] = useState("");

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

    if (registerPassword !== registerConfirmPassword) {
      toast({
        title: "Error",
        description: "Las contraseñas no coinciden. Por favor verifícalas.",
        variant: "destructive",
      });
      return;
    }

    if (registerPassword.length < 6) {
      toast({
        title: "Error",
        description: "La contraseña debe tener al menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

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
          referralCode: registerReferralCode || undefined,
          promoCode: registerPromoCode || undefined,
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
      if (data.resetUrl) {
        setDirectResetUrl(data.resetUrl);
      }
      toast({
        title: "Solicitud procesada",
        description: data.message,
      });
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
    setDirectResetUrl(null);
    setForgotPasswordEmail("");
  };

  // Forgot Password View
  if (showForgotPassword) {
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
              Recuperación de credenciales de acceso
            </p>
          </div>

          <Card className="shadow-xl shadow-slate-900/5 border border-slate-200/80 bg-white rounded-2xl">
            <CardHeader className="space-y-1 pb-4 text-center">
              <CardTitle className="text-xl font-bold text-slate-900">
                {resetEmailSent ? "Revisa tu email" : "Recuperar contraseña"}
              </CardTitle>
              <CardDescription className="text-slate-600">
                {resetEmailSent 
                  ? "Te hemos enviado instrucciones para restablecer tu contraseña."
                  : "Ingresa tu correo registrado y te enviaremos las instrucciones."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resetEmailSent ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <p className="text-emerald-800 text-sm font-medium">
                      Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.
                    </p>
                  </div>
                  {import.meta.env.DEV && directResetUrl && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-2">
                      <p className="text-amber-900 text-xs font-semibold">
                        [Entorno de Pruebas] Acceso directo disponible:
                      </p>
                      <Button 
                        type="button"
                        variant="outline"
                        className="w-full text-xs border-amber-300 bg-white text-amber-900 hover:bg-amber-100" 
                        onClick={() => { window.location.href = directResetUrl; }}
                      >
                        Restablecer Contraseña Directamente
                      </Button>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full border-slate-200 text-slate-700 hover:bg-slate-50" 
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
                    <Label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Correo Electrónico
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        className="pl-10 border-slate-200 bg-slate-50 focus:bg-white"
                        required
                        disabled={isLoading}
                        data-testid="input-forgot-email"
                      />
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
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
                    className="w-full text-slate-600 hover:text-slate-900" 
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

          <p className="text-center text-xs text-slate-500 mt-6">
            © 2026 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
          </p>
        </div>
      </div>
    );
  }

  // Main Login/Register View
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
            Gestiona tu cartera de clientes, créditos y comisiones
          </p>
        </div>

        <Card className="shadow-xl shadow-slate-900/5 border border-slate-200/80 bg-white rounded-2xl">
          <CardHeader className="space-y-1 pb-4 text-center">
            <CardTitle className="text-xl font-bold text-slate-900">Accede a tu cuenta</CardTitle>
            <CardDescription className="text-slate-600">
              Ingresa con tus credenciales para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="login" data-testid="tab-login" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                  Iniciar Sesión
                </TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-xs">
                  Registrarse
                </TabsTrigger>
              </TabsList>
              
              {/* Login Tab */}
              <TabsContent value="login">
                <form onSubmit={handleLocalLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Correo Electrónico
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10 border-slate-200 bg-slate-50 focus:bg-white"
                        required
                        disabled={isLoading}
                        data-testid="input-login-email"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Contraseña
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-xs font-semibold text-primary hover:underline"
                        data-testid="link-forgot-password"
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-10 border-slate-200 bg-slate-50 focus:bg-white"
                        required
                        disabled={isLoading}
                        data-testid="input-login-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        tabIndex={-1}
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-firstname" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Nombre
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                          id="register-firstname"
                          type="text"
                          placeholder="Juan"
                          value={registerFirstName}
                          onChange={(e) => setRegisterFirstName(e.target.value)}
                          className="pl-10 border-slate-200 bg-slate-50 focus:bg-white"
                          required
                          disabled={isLoading}
                          data-testid="input-register-firstname"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-lastname" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Apellido
                      </Label>
                      <Input
                        id="register-lastname"
                        type="text"
                        placeholder="Pérez"
                        value={registerLastName}
                        onChange={(e) => setRegisterLastName(e.target.value)}
                        className="border-slate-200 bg-slate-50 focus:bg-white"
                        required
                        disabled={isLoading}
                        data-testid="input-register-lastname"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-email" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Correo Electrónico
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="tu@email.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="pl-10 border-slate-200 bg-slate-50 focus:bg-white"
                        required
                        disabled={isLoading}
                        data-testid="input-register-email"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="register-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Contraseña
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? "text" : "password"}
                        placeholder="Mínimo 6 caracteres"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="pl-10 pr-10 border-slate-200 bg-slate-50 focus:bg-white"
                        minLength={6}
                        required
                        disabled={isLoading}
                        data-testid="input-register-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword((prev) => !prev)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        tabIndex={-1}
                      >
                        {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Confirmar Contraseña
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="register-confirm-password"
                        type={showRegisterConfirmPassword ? "text" : "password"}
                        placeholder="Repite la contraseña"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                        className="pl-10 pr-10 border-slate-200 bg-slate-50 focus:bg-white"
                        minLength={6}
                        required
                        disabled={isLoading}
                        data-testid="input-register-confirm-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                        tabIndex={-1}
                      >
                        {showRegisterConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {registerPassword && registerConfirmPassword && registerPassword !== registerConfirmPassword && (
                      <p className="text-xs text-red-600 font-medium">Las contraseñas no coinciden.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-referral" className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                      <span>Clave de Franquicia / Master</span>
                      <span className="text-slate-400 text-xs font-normal normal-case">Opcional</span>
                    </Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="register-referral"
                        type="text"
                        placeholder="Ej. MB-1234"
                        value={registerReferralCode}
                        onChange={(e) => setRegisterReferralCode(e.target.value)}
                        className="pl-10 uppercase font-mono border-slate-200 bg-slate-50 focus:bg-white"
                        disabled={isLoading}
                        data-testid="input-register-referral"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Si te refirió un Master Broker u Organización, ingresa su clave para ligarte a su red.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-promocode" className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-700">
                      <span>Código Promocional / Beneficio</span>
                      <span className="text-slate-400 text-xs font-normal normal-case">Opcional</span>
                    </Label>
                    <div className="relative">
                      <Tag className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <Input
                        id="register-promocode"
                        type="text"
                        placeholder="Ej. LANZAMIENTO2026"
                        value={registerPromoCode}
                        onChange={(e) => setRegisterPromoCode(e.target.value)}
                        className="pl-10 uppercase font-mono border-slate-200 bg-slate-50 focus:bg-white"
                        disabled={isLoading}
                        data-testid="input-register-promocode"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Aplica beneficios como meses gratuitos o descuentos. No define tu relación o red broker.
                    </p>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-md" 
                    disabled={isLoading || (Boolean(registerPassword && registerConfirmPassword && registerPassword !== registerConfirmPassword))}
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

        {/* Visible link to Brokers landing */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-700">¿Eres broker o aliado comercial?</p>
          <a
            href="/brokers"
            className="mt-1 inline-flex items-center text-xs font-bold text-primary hover:underline"
            data-testid="link-landing-to-brokers"
          >
            Conoce nuestro programa y comisiones
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </a>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Crédito Negocios. Soluciones especializadas para brokers financieros en México.
        </p>
      </div>
    </div>
  );
}
