#!/bin/bash

# Create user
curl -X POST \
  -H "Content-Type:application/json" \
  http://localhost:8080/auth/signup \
  -d '{"displayName":"Testing account","email":"email@email.com","password":"Teste@123"}'



# Login user
curl -X POST \
  -H "Content-Type:application/json" \
  http://localhost:8080/auth/login \
  -d '{"email":"email@email.com","password":"Teste@123"}'

