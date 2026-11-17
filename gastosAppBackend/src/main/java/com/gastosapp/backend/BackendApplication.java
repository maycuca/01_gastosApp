package com.gastosapp.backend;

import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import com.gastosapp.backend.config.BackendLocation;
import com.gastosapp.backend.tools.PasswordResetTool;

@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {
		// "reset-password <username>" runs the command line tool without starting the web server.
		if (args.length > 0 && PasswordResetTool.COMMAND.equals(args[0])) {
			PasswordResetTool.main(args);
			return;
		}
		SpringApplication application = new SpringApplication(BackendApplication.class);
		// Default directories (../data, frontend) are relative to the backend module, not to the working directory.
		application.setDefaultProperties(Map.of(BackendLocation.PROPERTY, BackendLocation.moduleDir().toString()));
		application.run(args);
	}

}
