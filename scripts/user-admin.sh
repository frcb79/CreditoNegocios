#!/bin/bash

# ============================================
# Script de Gestión de Usuarios
# Plataforma Broker Fintech
# ============================================

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir con color
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Función para ejecutar SQL
run_sql() {
    psql $DATABASE_URL -c "$1"
}

# ============================================
# MENÚ PRINCIPAL
# ============================================

show_menu() {
    echo ""
    echo "╔════════════════════════════════════════════╗"
    echo "║   Gestión de Usuarios - Broker Fintech    ║"
    echo "╚════════════════════════════════════════════╝"
    echo ""
    echo "1) Ver todos los usuarios"
    echo "2) Ver estadísticas por rol"
    echo "3) Buscar usuario por email"
    echo "4) Cambiar rol de usuario"
    echo "5) Activar/Desactivar usuario"
    echo "6) Hacer primer usuario super_admin"
    echo "7) Ver brokers con más actividad"
    echo "8) Ver master brokers y sus equipos"
    echo "9) Crear usuario de prueba"
    echo "0) Salir"
    echo ""
}

# ============================================
# FUNCIONES
# ============================================

list_users() {
    print_info "Listando todos los usuarios..."
    echo ""
    run_sql "SELECT 
        id,
        email,
        COALESCE(first_name || ' ' || last_name, email) as nombre,
        role as rol,
        CASE WHEN is_active THEN 'Activo' ELSE 'Inactivo' END as estado,
        TO_CHAR(created_at, 'DD/MM/YYYY') as fecha_creacion
    FROM users
    ORDER BY role, email;"
}

show_stats() {
    print_info "Estadísticas por rol..."
    echo ""
    run_sql "SELECT 
        role as rol,
        COUNT(*) as total,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as activos,
        SUM(CASE WHEN NOT is_active THEN 1 ELSE 0 END) as inactivos
    FROM users
    GROUP BY role
    ORDER BY 
        CASE role
            WHEN 'super_admin' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'master_broker' THEN 3
            WHEN 'broker' THEN 4
            ELSE 5
        END;"
}

search_user() {
    echo ""
    read -p "Ingresa el email del usuario: " email
    print_info "Buscando usuario con email: $email"
    echo ""
    run_sql "SELECT 
        id,
        email,
        COALESCE(first_name || ' ' || last_name, 'Sin nombre') as nombre,
        role as rol,
        CASE WHEN is_active THEN 'Activo' ELSE 'Inactivo' END as estado,
        phone as telefono,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as creado
    FROM users
    WHERE email = '$email';"
}

change_role() {
    echo ""
    read -p "Ingresa el email del usuario: " email
    echo ""
    echo "Roles disponibles:"
    echo "1) broker"
    echo "2) master_broker"
    echo "3) admin"
    echo "4) super_admin"
    echo ""
    read -p "Selecciona el nuevo rol (1-4): " role_choice
    
    case $role_choice in
        1) new_role="broker" ;;
        2) new_role="master_broker" ;;
        3) new_role="admin" ;;
        4) new_role="super_admin" ;;
        *) print_error "Opción inválida"; return ;;
    esac
    
    print_info "Cambiando rol a '$new_role' para usuario: $email"
    run_sql "UPDATE users SET role = '$new_role', updated_at = NOW() WHERE email = '$email';"
    
    if [ $? -eq 0 ]; then
        print_success "Rol actualizado correctamente"
        print_warning "El usuario debe cerrar sesión y volver a entrar para que el cambio tome efecto"
    else
        print_error "Error al actualizar el rol"
    fi
}

toggle_active() {
    echo ""
    read -p "Ingresa el email del usuario: " email
    echo ""
    echo "¿Qué deseas hacer?"
    echo "1) Activar usuario"
    echo "2) Desactivar usuario"
    echo ""
    read -p "Selecciona una opción (1-2): " action
    
    case $action in
        1) 
            print_info "Activando usuario: $email"
            run_sql "UPDATE users SET is_active = true, updated_at = NOW() WHERE email = '$email';"
            print_success "Usuario activado"
            ;;
        2) 
            print_info "Desactivando usuario: $email"
            run_sql "UPDATE users SET is_active = false, updated_at = NOW() WHERE email = '$email';"
            print_success "Usuario desactivado"
            ;;
        *) 
            print_error "Opción inválida"
            ;;
    esac
}

make_first_admin() {
    print_info "Convirtiendo el primer usuario registrado en super_admin..."
    echo ""
    
    # Mostrar quién es el primer usuario
    run_sql "SELECT 
        email,
        COALESCE(first_name || ' ' || last_name, email) as nombre,
        role as rol_actual,
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as fecha_registro
    FROM users
    ORDER BY created_at ASC
    LIMIT 1;"
    
    echo ""
    read -p "¿Confirmas que deseas hacer a este usuario super_admin? (s/n): " confirm
    
    if [[ $confirm == "s" || $confirm == "S" ]]; then
        run_sql "UPDATE users SET role = 'super_admin', updated_at = NOW() WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);"
        print_success "Primer usuario convertido a super_admin correctamente"
        print_warning "El usuario debe cerrar sesión y volver a entrar"
    else
        print_info "Operación cancelada"
    fi
}

show_top_brokers() {
    print_info "Brokers con más actividad..."
    echo ""
    run_sql "SELECT 
        u.email as broker_email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as nombre,
        COUNT(DISTINCT c.id) as clientes,
        COUNT(DISTINCT cr.id) as creditos,
        COALESCE(SUM(CASE WHEN cr.status = 'dispersed' THEN cr.amount ELSE 0 END), 0) as monto_dispersado
    FROM users u
    LEFT JOIN clients c ON c.broker_id = u.id
    LEFT JOIN credits cr ON cr.client_id = c.id
    WHERE u.role IN ('broker', 'master_broker')
    AND u.is_active = true
    GROUP BY u.id, u.email, u.first_name, u.last_name
    ORDER BY clientes DESC
    LIMIT 10;"
}

show_master_brokers() {
    print_info "Master Brokers y sus equipos..."
    echo ""
    run_sql "SELECT 
        mb.email as master_broker,
        COALESCE(mb.first_name || ' ' || mb.last_name, mb.email) as nombre,
        COUNT(b.id) as brokers_en_equipo,
        CASE WHEN mb.is_active THEN 'Activo' ELSE 'Inactivo' END as estado
    FROM users mb
    LEFT JOIN users b ON b.master_broker_id = mb.id
    WHERE mb.role = 'master_broker'
    GROUP BY mb.id, mb.email, mb.first_name, mb.last_name, mb.is_active
    ORDER BY brokers_en_equipo DESC;"
}

create_test_user() {
    echo ""
    echo "Tipos de usuario de prueba:"
    echo "1) Broker de prueba"
    echo "2) Master Broker de prueba"
    echo "3) Admin de prueba"
    echo ""
    read -p "Selecciona el tipo (1-3): " type_choice
    
    case $type_choice in
        1) 
            role="broker"
            email="broker.test@example.com"
            first_name="Broker"
            ;;
        2) 
            role="master_broker"
            email="master.test@example.com"
            first_name="Master"
            ;;
        3) 
            role="super_admin"
            email="admin.test@example.com"
            first_name="Admin"
            ;;
        *) 
            print_error "Opción inválida"
            return
            ;;
    esac
    
    print_info "Creando usuario de prueba: $email con rol $role"
    
    run_sql "INSERT INTO users (id, email, first_name, last_name, role, is_active, created_at, updated_at)
    VALUES (
        gen_random_uuid()::text,
        '$email',
        '$first_name',
        'Prueba',
        '$role',
        true,
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
        role = '$role',
        is_active = true,
        updated_at = NOW();"
    
    if [ $? -eq 0 ]; then
        print_success "Usuario de prueba creado: $email"
        print_info "Password: (será definido al hacer login por primera vez con Replit Auth)"
    else
        print_error "Error al crear usuario de prueba"
    fi
}

# ============================================
# MAIN LOOP
# ============================================

while true; do
    show_menu
    read -p "Selecciona una opción: " choice
    
    case $choice in
        1) list_users ;;
        2) show_stats ;;
        3) search_user ;;
        4) change_role ;;
        5) toggle_active ;;
        6) make_first_admin ;;
        7) show_top_brokers ;;
        8) show_master_brokers ;;
        9) create_test_user ;;
        0) 
            print_info "Saliendo..."
            exit 0
            ;;
        *) 
            print_error "Opción inválida"
            ;;
    esac
    
    echo ""
    read -p "Presiona Enter para continuar..."
done
